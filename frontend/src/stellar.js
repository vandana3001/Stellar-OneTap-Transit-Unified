import {
  Contract,
  TransactionBuilder,
  rpc as SorobanRpc,
  nativeToScVal,
  scValToNative,
  BASE_FEE,
  xdr,
} from "@stellar/stellar-sdk";
import {
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import { NETWORK, CONTRACTS, OPERATORS } from "./config";

const OPERATOR_LABELS = Object.fromEntries(OPERATORS.map((op) => [op.id, op.label]));


export async function isFreighterAvailable() {
  try {
    const { isConnected: connected } = await isConnected();
    return !!connected;
  } catch {
    return false;
  }
}


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


export async function hasClaimedFaucet(sourcePublicKey) {
  const decoded = await simulateRead(
    CONTRACTS.fareToken,
    "has_claimed_faucet",
    [scAddress(sourcePublicKey)],
    sourcePublicKey
  );
  return !!decoded;
}


export async function claimFaucet(sourcePublicKey) {
  return invokeContract({
    contractId: CONTRACTS.fareToken,
    method: "claim_faucet",
    args: [scAddress(sourcePublicKey)],
    sourcePublicKey,
  });
}


function decodeInvocationParams(parameters) {
  if (!Array.isArray(parameters)) return null;
  try {
    return parameters.map((p) => scValToNative(xdr.ScVal.fromXDR(p.value, "base64")));
  } catch {
    return null;
  }
}


function describeOperation(record) {
  if (record.type !== "invoke_host_function") return null;

  const values = decodeInvocationParams(record.parameters);
  if (!values || values.length < 2) return null;

  const fn = values[1];
  const args = values.slice(2);

  switch (fn) {
    case "tap_in": {
      const [, operatorId, station] = args; 
      const label = OPERATOR_LABELS[operatorId] || operatorId;
      return station ? `Tap in on ${label} at ${station}` : `Tap in on ${label}`;
    }
    case "tap_out": {
      const [, station] = args; 
      return station ? `Tap out at ${station}` : "Tap out";
    }
    case "claim_faucet":
      return "Starter faucet claim";
    default:
      return null;
  }
}


export async function getAccountHistory(sourcePublicKey, limit = 20) {
  const url =
    `${NETWORK.horizonUrl}/accounts/${sourcePublicKey}/operations` +
    `?order=desc&limit=${limit}&include_failed=true`;

  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Could not reach Horizon: ${err.message || err}`);
  }

  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Horizon returned ${res.status} while loading history`);
  }

  const data = await res.json();
  const records = data._embedded?.records || [];
  return records.map(mapOperationRecord);
}


export function streamAccountHistory(sourcePublicKey, { onOperation, onError } = {}) {
  const url =
    `${NETWORK.horizonUrl}/accounts/${sourcePublicKey}/operations` +
    `?cursor=now&order=asc`;

  const es = new EventSource(url);

  es.onmessage = (evt) => {
    try {
      const record = JSON.parse(evt.data);
      if (!record?.id) return; 
      onOperation?.(mapOperationRecord(record));
    } catch {
      
    }
  };

  es.onerror = (err) => {
    onError?.(err);
  };

  return () => es.close();
}

function mapOperationRecord(record) {
  return {
    id: record.id,
    type: record.type, 
    txHash: record.transaction_hash,
    createdAt: record.created_at,
    successful: record.transaction_successful !== false,
    detail: describeOperation(record),
  };
}


export function operationLabel(type) {
  switch (type) {
    case "invoke_host_function":
      return "Contract call";
    case "payment":
      return "Payment";
    case "create_account":
      return "Account created";
    case "change_trust":
      return "Trustline change";
    default:
      return String(type || "Operation")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
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