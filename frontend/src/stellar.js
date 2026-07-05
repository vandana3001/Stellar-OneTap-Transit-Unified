import {
  Contract,
  TransactionBuilder,
  rpc as SorobanRpc,
  nativeToScVal,
  scValToNative,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import {
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import { NETWORK, CONTRACTS } from "./config";

/**
 * Checks whether Freighter is installed AND actually reachable, by
 * round-tripping a real message to the extension rather than just
 * checking for the presence of an injected object.
 */
export async function isFreighterAvailable() {
  try {
    const { isConnected: connected } = await isConnected();
    return !!connected;
  } catch {
    return false;
  }
}

/**
 * Connects to Freighter and returns the user's public key.
 * Throws a descriptive Error (never a raw SDK error) so the UI layer
 * can render it directly.
 */
export async function connectWallet() {
  try {
    const { address, error } = await requestAccess();
    if (error) throw new Error(error);
    if (!address) throw new Error("No address returned by Freighter.");
    return address;
  } catch (err) {
    throw new Error(`Wallet connection failed: ${err.message || err}`);
  }
}

/**
 * Builds, simulates, signs (via Freighter), and submits a single
 * contract invocation. Returns the transaction hash on success.
 *
 * This function intentionally does ONE thing end to end so every
 * caller in the UI gets identical error handling and loading
 * semantics - no duplicated try/catch scattered across components.
 */
export async function invokeContract({ contractId, method, args, sourcePublicKey }) {
  const server = new SorobanRpc.Server(NETWORK.rpcUrl);

  let account;
  try {
    account = await server.getAccount(sourcePublicKey);
  } catch (err) {
    throw new Error(
      "Could not load your testnet account. Make sure it's funded via friendbot."
    );
  }

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  let prepared;
  try {
    prepared = await server.prepareTransaction(tx);
  } catch (err) {
    throw new Error(`Simulation failed: ${extractContractError(err)}`);
  }

  let signedResult;
  try {
    signedResult = await signTransaction(prepared.toXDR(), {
      networkPassphrase: NETWORK.networkPassphrase,
      address: sourcePublicKey,
    });
    if (signedResult.error) {
      throw new Error(signedResult.error);
    }
  } catch (err) {
    throw new Error(
      `Transaction signing was cancelled or failed: ${err.message || err}`
    );
  }

  const signedTx = TransactionBuilder.fromXDR(
    signedResult.signedTxXdr,
    NETWORK.networkPassphrase
  );

  let sendResult;
  try {
    sendResult = await server.sendTransaction(signedTx);
  } catch (err) {
    throw new Error(`Submission failed: ${extractContractError(err)}`);
  }

  if (sendResult.status === "ERROR") {
    throw new Error(`Transaction rejected: ${extractContractError(sendResult)}`);
  }

  // Poll until the transaction is confirmed, so the UI can show a
  // single, accurate "confirmed"/"failed" state rather than guessing.
  let getResult = await server.getTransaction(sendResult.hash);
  let attempts = 0;
  while (getResult.status === "NOT_FOUND" && attempts < 15) {
    await new Promise((r) => setTimeout(r, 1000));
    getResult = await server.getTransaction(sendResult.hash);
    attempts += 1;
  }

  if (getResult.status !== "SUCCESS") {
    throw new Error(
      `Transaction did not succeed on-chain: ${getResult.status}. ` +
        `Check the hash ${sendResult.hash} on Stellar Expert.`
    );
  }

  return { hash: sendResult.hash, result: getResult };
}

/**
 * Runs a read-only simulation of a contract call and decodes the
 * result to a plain JS value. No signing, no wallet popup, no fee.
 * Returns null if the account doesn't exist yet or simulation fails,
 * since these are background sync checks, not user-initiated actions.
 */
async function simulateRead(contractId, method, args, sourcePublicKey) {
  const server = new SorobanRpc.Server(NETWORK.rpcUrl);

  let account;
  try {
    account = await server.getAccount(sourcePublicKey);
  } catch {
    return null;
  }

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  let sim;
  try {
    sim = await server.simulateTransaction(tx);
  } catch {
    return null;
  }

  if (SorobanRpc.Api.isSimulationError(sim)) {
    return null;
  }

  const retval = sim.result?.retval;
  if (!retval) return null;

  return scValToNative(retval);
}

/**
 * Reads the rider's current open trip directly from transit_controller.
 * Returns null if there's no open trip, or a plain JS object:
 *   { operatorId, entryStation, holdAmount, entryLedgerTs }
 *
 * This is what keeps the UI's "Tap In"/"Tap Out" button state honest
 * against actual chain state, instead of trusting in-memory React
 * state alone - which drifts out of sync any time a trip was opened
 * from a different session, device, or the CLI.
 */
export async function getOpenTrip(sourcePublicKey) {
  const decoded = await simulateRead(
    CONTRACTS.transitController,
    "get_open_trip",
    [scAddress(sourcePublicKey)],
    sourcePublicKey
  );

  if (!decoded) return null;

  return {
    operatorId: decoded.operator_id,
    entryStation: decoded.entry_station,
    holdAmount: decoded.hold_amount,
    entryLedgerTs: decoded.entry_ledger_ts,
  };
}

/**
 * Reads the rider's current FARE balance. Returns 0 on any failure
 * (e.g. brand new unfunded account) rather than throwing, since this
 * is used for a background "should we offer the faucet" check.
 */
export async function getBalance(sourcePublicKey) {
  const decoded = await simulateRead(
    CONTRACTS.fareToken,
    "balance",
    [scAddress(sourcePublicKey)],
    sourcePublicKey
  );
  if (decoded === null || decoded === undefined) return 0;
  return Number(decoded);
}

/**
 * Whether this address has already claimed the one-time faucet.
 */
export async function hasClaimedFaucet(sourcePublicKey) {
  const decoded = await simulateRead(
    CONTRACTS.fareToken,
    "has_claimed_faucet",
    [scAddress(sourcePublicKey)],
    sourcePublicKey
  );
  return !!decoded;
}

/**
 * Claims the one-time starter FARE balance for the connected wallet.
 * The rider signs for themselves - no admin/backend involvement.
 */
export async function claimFaucet(sourcePublicKey) {
  return invokeContract({
    contractId: CONTRACTS.fareToken,
    method: "claim_faucet",
    args: [scAddress(sourcePublicKey)],
    sourcePublicKey,
  });
}

export function scSymbol(value) {
  return nativeToScVal(value, { type: "symbol" });
}

export function scAddress(value) {
  return nativeToScVal(value, { type: "address" });
}

export function scI128(value) {
  return nativeToScVal(value, { type: "i128" });
}

function extractContractError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}