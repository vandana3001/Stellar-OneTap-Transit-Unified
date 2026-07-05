import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the entire stellar.js module so tests never touch Freighter,
// Soroban RPC, or Horizon - just the UI's reaction to what those calls
// resolve/reject with. This also means these tests never make real
// network calls, so they're fast and deterministic.
vi.mock("../stellar", () => ({
  connectWallet: vi.fn(),
  invokeContract: vi.fn(),
  isFreighterAvailable: vi.fn(),
  getOpenTrip: vi.fn(),
  getBalance: vi.fn(),
  hasClaimedFaucet: vi.fn(),
  claimFaucet: vi.fn(),
  scSymbol: vi.fn((v) => v),
  scAddress: vi.fn((v) => v),
  getAccountHistory: vi.fn(),
  streamAccountHistory: vi.fn(() => vi.fn()), // returns an unsubscribe fn
  operationLabel: vi.fn((type) => type),
}));

import App from "../App";
import * as stellar from "../stellar";

// A fixed, checksum-valid Stellar public key (StrKey-encoded) - not a
// real/random keypair, just a deterministic constant. scAddress() /
// Address parsing in the real SDK only validates the StrKey checksum,
// it never needs the payload to be a genuine Ed25519 curve point, so a
// hardcoded value is enough and avoids calling Keypair.random() in
// jsdom, which throws ("expected Uint8Array of length 32, got
// type=object") because the random bytes it generates come from a
// different global realm than jsdom's Uint8Array.
const PUBLIC_KEY = "GAAACAQDAQCQMBYIBEFAWDANBYHRAEISCMKBKFQXDAMRUGY4DUPB7JZX";

// Mirrors the app's own shorten() helper (App.jsx is not exported, so we
// reproduce the same slicing here) - lets tests assert against the
// *actual* connected key instead of a hardcoded value that would only
// match by coincidence, since PUBLIC_KEY is freshly randomized above.
const SHORT_KEY = PUBLIC_KEY.slice(0, 6) + "..." + PUBLIC_KEY.slice(-6);

// The nav renders twice in the DOM (a full sidebar for desktop, a
// compact pill nav for mobile - CSS media queries hide one or the
// other, but jsdom has no viewport so both are present). Every click on
// a nav label MUST go through this helper (or screen.getAllByText),
// never screen.getByText(label) directly, or the query will throw on
// "multiple elements found".
async function clickNav(user, label) {
  const [first] = screen.getAllByText(label);
  await user.click(first);
}

async function connectWalletSuccessfully(user) {
  stellar.connectWallet.mockResolvedValue(PUBLIC_KEY);
  await clickNav(user, "Wallet");
  await user.click(screen.getByRole("button", { name: /connect freighter/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults so every test doesn't have to stub every call;
  // individual tests override these to exercise error/loading paths.
  stellar.isFreighterAvailable.mockResolvedValue(true);
  stellar.getOpenTrip.mockResolvedValue(null);
  stellar.getBalance.mockResolvedValue(0);
  stellar.hasClaimedFaucet.mockResolvedValue(true); // avoid auto-faucet noise
  stellar.getAccountHistory.mockResolvedValue([]);
});

describe("initial render", () => {
  it("shows the Book trip tab by default and all nav items", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Book trip" })).toBeInTheDocument();
    // Each label appears at least once (sidebar nav + mobile nav, and
    // for "Book trip" also the panel heading) - use getAllByText, since
    // getByText throws the moment there's more than one match.
    ["Book trip", "Tap card", "Wallet", "Activity", "Chain history"].forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
    // Let the async Freighter-detection effect settle before the test
    // ends, otherwise its state update lands after this test has
    // already finished and React logs an act(...) warning.
    await waitFor(() => expect(stellar.isFreighterAvailable).toHaveBeenCalled());
  });

  it("shows a connect prompt on Tap card when no wallet is connected", async () => {
    const user = userEvent.setup();
    render(<App />);
    await clickNav(user, "Tap card");
    expect(screen.getByText(/connect your wallet to see this/i)).toBeInTheDocument();
  });
});

describe("wallet connection", () => {
  it("shows 'Connecting…' while the connect call is pending", async () => {
    const user = userEvent.setup();
    let resolveConnect;
    stellar.connectWallet.mockReturnValue(
      new Promise((res) => { resolveConnect = res; })
    );
    render(<App />);
    await clickNav(user, "Wallet");
    await user.click(screen.getByRole("button", { name: /connect freighter/i }));

    expect(screen.getByRole("button", { name: /connecting/i })).toBeDisabled();
    resolveConnect(PUBLIC_KEY);
    // Matches both the shortened wallet-chip address in the header and
    // the full address in the Wallet tab's <code> block - either is
    // proof the connect resolved, so assert at least one match rather
    // than a single getByText (which throws on >1 match).
    await waitFor(() =>
      expect(screen.getAllByText(new RegExp(SHORT_KEY.slice(0, 6))).length).toBeGreaterThan(0)
    );
  });

  it("shows an error message if connection fails", async () => {
    const user = userEvent.setup();
    stellar.connectWallet.mockRejectedValue(new Error("User rejected request"));
    render(<App />);
    await clickNav(user, "Wallet");
    await user.click(screen.getByRole("button", { name: /connect freighter/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/User rejected request/i);
  });

  it("syncs trip and balance state immediately after connecting", async () => {
    const user = userEvent.setup();
    stellar.getBalance.mockResolvedValue(250);
    render(<App />);
    await connectWalletSuccessfully(user);

    await waitFor(() => expect(stellar.getOpenTrip).toHaveBeenCalledWith(PUBLIC_KEY));
    await waitFor(() => expect(stellar.getBalance).toHaveBeenCalledWith(PUBLIC_KEY));
  });
});

describe("trip status sync — loading & error/retry", () => {
  it("shows a spinner while syncing and clears it after success", async () => {
    const user = userEvent.setup();
    let resolveTrip;
    stellar.getOpenTrip.mockReturnValue(new Promise((res) => { resolveTrip = res; }));

    render(<App />);
    await clickNav(user, "Wallet");
    stellar.connectWallet.mockResolvedValue(PUBLIC_KEY);
    await user.click(screen.getByRole("button", { name: /connect freighter/i }));
    await clickNav(user, "Tap card");

    expect(screen.getByText(/checking your trip status on-chain/i)).toBeInTheDocument();
    resolveTrip(null);
    await waitFor(() =>
      expect(screen.queryByText(/checking your trip status on-chain/i)).not.toBeInTheDocument()
    );
  });

  it("shows an error with a Retry button on failure, and Retry re-calls getOpenTrip", async () => {
    const user = userEvent.setup();
    stellar.getOpenTrip.mockRejectedValue(new Error("RPC unreachable"));
    render(<App />);
    await connectWalletSuccessfully(user);
    await clickNav(user, "Tap card");

    expect(await screen.findByText(/RPC unreachable/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: /retry/i });

    stellar.getOpenTrip.mockResolvedValue(null);
    await user.click(retryBtn);

    await waitFor(() => expect(stellar.getOpenTrip).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText(/RPC unreachable/i)).not.toBeInTheDocument()
    );
  });
});

describe("balance sync — loading & error/retry", () => {
  it("shows an error with Retry in the Wallet tab's Balance panel, and Retry re-calls getBalance", async () => {
    const user = userEvent.setup();
    stellar.getBalance.mockRejectedValue(new Error("Simulation failed"));
    render(<App />);
    await connectWalletSuccessfully(user);

    const balancePanel = (await screen.findByText("Balance")).closest("section");
    expect(within(balancePanel).getByText(/Simulation failed/i)).toBeInTheDocument();

    stellar.getBalance.mockResolvedValue(500);
    await user.click(within(balancePanel).getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(stellar.getBalance).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(within(balancePanel).queryByText(/Simulation failed/i)).not.toBeInTheDocument()
    );
  });
});

describe("chain history — loading, error/retry, and success rendering", () => {
  it("shows an error with Retry, and Retry re-fetches history", async () => {
    const user = userEvent.setup();
    stellar.getAccountHistory.mockRejectedValue(new Error("Horizon returned 500"));
    render(<App />);
    await connectWalletSuccessfully(user);
    await clickNav(user, "Chain history");

    expect(await screen.findByText(/Horizon returned 500/i)).toBeInTheDocument();

    stellar.getAccountHistory.mockResolvedValue([
      {
        id: "1",
        type: "invoke_host_function",
        txHash: "deadbeef1234deadbeef1234",
        createdAt: "2026-07-05T10:00:00Z",
        successful: true,
        detail: "Tap in on Delhi Metro at RAJIV_CHK",
      },
    ]);
    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText("Tap in on Delhi Metro at RAJIV_CHK")).toBeInTheDocument();
  });

  it("flags failed operations with a 'failed' pill", async () => {
    const user = userEvent.setup();
    stellar.getAccountHistory.mockResolvedValue([
      {
        id: "2",
        type: "invoke_host_function",
        txHash: "beefdead5678beefdead5678",
        createdAt: "2026-07-05T10:05:00Z",
        successful: false,
        detail: "Tap out at NEW_DELHI",
      },
    ]);
    render(<App />);
    await connectWalletSuccessfully(user);
    await clickNav(user, "Chain history");

    expect(await screen.findByText("failed")).toBeInTheDocument();
  });

  it("shows a 'no activity' message when history loads empty", async () => {
    const user = userEvent.setup();
    stellar.getAccountHistory.mockResolvedValue([]);
    render(<App />);
    await connectWalletSuccessfully(user);
    await clickNav(user, "Chain history");

    expect(
      await screen.findByText(/no on-chain activity yet for this address/i)
    ).toBeInTheDocument();
  });
});