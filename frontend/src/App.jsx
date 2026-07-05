import { useState, useCallback, useEffect } from "react";
import {
  connectWallet,
  invokeContract,
  isFreighterAvailable,
  getOpenTrip,
  getBalance,
  hasClaimedFaucet,
  claimFaucet,
  scSymbol,
  scAddress,
} from "./stellar";
import { CONTRACTS, OPERATORS, STATIONS } from "./config";
import "./App.css";

export const STATUS = {
  IDLE: "idle",
  LOADING: "loading",
  SUCCESS: "success",
  ERROR: "error",
};

export default function App() {
  const [publicKey, setPublicKey] = useState(null);
  const [walletStatus, setWalletStatus] = useState(STATUS.IDLE);
  const [walletError, setWalletError] = useState(null);
  const [freighterReady, setFreighterReady] = useState(false);
  const [freighterChecking, setFreighterChecking] = useState(true);

  const [operatorId, setOperatorId] = useState(OPERATORS[0].id);
  const [entryStation, setEntryStation] = useState(STATIONS[OPERATORS[0].id][0]);
  const [exitStation, setExitStation] = useState(STATIONS[OPERATORS[0].id][1]);

  const [tapStatus, setTapStatus] = useState(STATUS.IDLE);
  const [tapError, setTapError] = useState(null);
  const [lastTxHash, setLastTxHash] = useState(null);
  const [tripOpen, setTripOpen] = useState(false);
  const [tripSyncing, setTripSyncing] = useState(false);

  const [balance, setBalance] = useState(null);
  const [faucetStatus, setFaucetStatus] = useState(STATUS.IDLE);
  const [faucetError, setFaucetError] = useState(null);
  const [faucetClaimed, setFaucetClaimed] = useState(false);

  // isFreighterAvailable() round-trips a real message to the extension
  // (via @stellar/freighter-api) instead of just checking for an
  // injected object, so it's async. Poll briefly on mount since the
  // extension's content script can attach slightly after our first render.
  useEffect(() => {
    let attempts = 0;
    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      const available = await isFreighterAvailable();
      if (cancelled) return;

      if (available) {
        setFreighterReady(true);
        setFreighterChecking(false);
        return;
      }

      if (attempts < 10) {
        attempts += 1;
        setTimeout(check, 300);
      } else {
        setFreighterChecking(false);
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, []);

  // Pulls the rider's real on-chain trip state and syncs local UI
  // state to match it. Used right after connecting, and again after
  // every tap, so the buttons never lie about what's actually on chain.
  const syncTripState = useCallback(async (key) => {
    setTripSyncing(true);
    try {
      const openTrip = await getOpenTrip(key);
      if (openTrip) {
        setTripOpen(true);
        setOperatorId(openTrip.operatorId);
        setEntryStation(openTrip.entryStation);
      } else {
        setTripOpen(false);
      }
    } catch {
      // Sync failure shouldn't block the UI - fall back to whatever
      // local state currently says, user can still act manually.
    } finally {
      setTripSyncing(false);
    }
  }, []);

  // Pulls the rider's real FARE balance and faucet-claim status.
  const syncBalanceState = useCallback(async (key) => {
    try {
      const [bal, claimed] = await Promise.all([
        getBalance(key),
        hasClaimedFaucet(key),
      ]);
      setBalance(bal);
      setFaucetClaimed(claimed);
    } catch {
      // leave previous values as-is on failure
    }
  }, []);

  const handleConnect = useCallback(async () => {
    setWalletStatus(STATUS.LOADING);
    setWalletError(null);
    try {
      const key = await connectWallet();
      setPublicKey(key);
      setWalletStatus(STATUS.SUCCESS);
      await syncTripState(key);
      await syncBalanceState(key);
    } catch (err) {
      setWalletError(err.message);
      setWalletStatus(STATUS.ERROR);
    }
  }, [syncTripState, syncBalanceState]);

  // Auto-claim the faucet the first time a new, unfunded wallet
  // connects - so a brand new user never has to know a faucet exists
  // or ask anyone to fund them. Only fires once balance/claim status
  // has actually loaded, and only if genuinely unclaimed.
  useEffect(() => {
    if (!publicKey) return;
    if (balance === null) return; // still loading
    if (faucetClaimed) return;
    if (balance > 0) return; // already has funds some other way
    if (faucetStatus === STATUS.LOADING || faucetStatus === STATUS.SUCCESS) return;

    (async () => {
      setFaucetStatus(STATUS.LOADING);
      setFaucetError(null);
      try {
        await claimFaucet(publicKey);
        setFaucetStatus(STATUS.SUCCESS);
        await syncBalanceState(publicKey);
      } catch (err) {
        setFaucetError(err.message);
        setFaucetStatus(STATUS.ERROR);
      }
    })();
  }, [publicKey, balance, faucetClaimed, faucetStatus, syncBalanceState]);

  const handleTapIn = useCallback(async () => {
    if (!publicKey) return;
    setTapStatus(STATUS.LOADING);
    setTapError(null);
    try {
      const { hash } = await invokeContract({
        contractId: CONTRACTS.transitController,
        method: "tap_in",
        args: [scAddress(publicKey), scSymbol(operatorId), scSymbol(entryStation)],
        sourcePublicKey: publicKey,
      });
      setLastTxHash(hash);
      setTapStatus(STATUS.SUCCESS);
      await syncTripState(publicKey);
      await syncBalanceState(publicKey);
    } catch (err) {
      setTapError(err.message);
      setTapStatus(STATUS.ERROR);
      await syncTripState(publicKey);
    }
  }, [publicKey, operatorId, entryStation, syncTripState, syncBalanceState]);

  const handleTapOut = useCallback(async () => {
    if (!publicKey) return;
    setTapStatus(STATUS.LOADING);
    setTapError(null);
    try {
      const { hash } = await invokeContract({
        contractId: CONTRACTS.transitController,
        method: "tap_out",
        args: [scAddress(publicKey), scSymbol(exitStation)],
        sourcePublicKey: publicKey,
      });
      setLastTxHash(hash);
      setTapStatus(STATUS.SUCCESS);
      await syncTripState(publicKey);
      await syncBalanceState(publicKey);
    } catch (err) {
      setTapError(err.message);
      setTapStatus(STATUS.ERROR);
      await syncTripState(publicKey);
    }
  }, [publicKey, exitStation, syncTripState, syncBalanceState]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>Stellar Transit Unified</h1>
        <p className="tagline">One token. Every ride.</p>
      </header>

      <main className="app__main">
        <section className="card">
          <h2>1. Connect wallet</h2>
          {!freighterChecking && !freighterReady && (
            <p className="hint">
              Freighter extension not detected. Install it from{" "}
              <a href="https://freighter.app" target="_blank" rel="noreferrer">
                freighter.app
              </a>{" "}
              to continue.
            </p>
          )}
          {!publicKey ? (
            <button
              className="btn btn--primary"
              onClick={handleConnect}
              disabled={walletStatus === STATUS.LOADING}
            >
              {walletStatus === STATUS.LOADING ? "Connecting..." : "Connect Freighter"}
            </button>
          ) : (
            <>
              <p className="connected">
                Connected: <code>{shorten(publicKey)}</code>
                {tripSyncing && <span className="hint"> (syncing trip state...)</span>}
              </p>
              <p className="balance">
                Balance:{" "}
                {balance === null ? "loading..." : `${balance} FARE`}
              </p>
              {faucetStatus === STATUS.LOADING && (
                <p className="hint">Claiming your starter FARE balance...</p>
              )}
              {faucetStatus === STATUS.SUCCESS && (
                <p className="success">You received 500 FARE to get started.</p>
              )}
              {faucetStatus === STATUS.ERROR && faucetError && (
                <p className="error" role="alert">
                  Faucet claim failed: {faucetError}
                </p>
              )}
            </>
          )}
          {walletStatus === STATUS.ERROR && (
            <p className="error" role="alert">
              {walletError}
            </p>
          )}
        </section>

        <section className="card">
          <h2>2. Select operator &amp; ride</h2>
          {tripOpen && (
            <p className="hint">
              You have an open trip on {operatorId} from {entryStation}. Select
              your exit station and tap out to close it before starting a new
              trip.
            </p>
          )}
          <label>
            Operator
            <select
              value={operatorId}
              disabled={tripOpen}
              onChange={(e) => {
                setOperatorId(e.target.value);
                setEntryStation(STATIONS[e.target.value][0]);
                setExitStation(STATIONS[e.target.value][1] || STATIONS[e.target.value][0]);
              }}
            >
              {OPERATORS.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Entry station
            <select
              value={entryStation}
              disabled={tripOpen}
              onChange={(e) => setEntryStation(e.target.value)}
            >
              {STATIONS[operatorId].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label>
            Exit station
            <select value={exitStation} onChange={(e) => setExitStation(e.target.value)}>
              {STATIONS[operatorId].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="card">
          <h2>3. Tap</h2>
          <div className="tap-buttons">
            <button
              className="btn btn--tap-in"
              onClick={handleTapIn}
              disabled={!publicKey || tripOpen || tapStatus === STATUS.LOADING || tripSyncing}
            >
              {tapStatus === STATUS.LOADING && !tripOpen ? "Tapping in..." : "Tap In"}
            </button>
            <button
              className="btn btn--tap-out"
              onClick={handleTapOut}
              disabled={!publicKey || !tripOpen || tapStatus === STATUS.LOADING || tripSyncing}
            >
              {tapStatus === STATUS.LOADING && tripOpen ? "Tapping out..." : "Tap Out"}
            </button>
          </div>

          {tapStatus === STATUS.ERROR && (
            <p className="error" role="alert">
              {tapError}
            </p>
          )}
          {tapStatus === STATUS.SUCCESS && lastTxHash && (
            <p className="success">
              Confirmed. Tx:{" "}
              <a
                href={"https://stellar.expert/explorer/testnet/tx/" + lastTxHash}
                target="_blank"
                rel="noreferrer"
              >
                {shorten(lastTxHash)}
              </a>
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

function shorten(value) {
  if (!value) return "";
  return value.slice(0, 6) + "..." + value.slice(-6);
}