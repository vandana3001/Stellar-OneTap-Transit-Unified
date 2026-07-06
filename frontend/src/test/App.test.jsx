import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";


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
  streamAccountHistory: vi.fn(() => vi.fn()), 
  operationLabel: vi.fn((type) => type),
}));

import App from "../App";
import * as stellar from "../stellar";


const PUBLIC_KEY = "GAAACAQDAQCQMBYIBEFAWDANBYHRAEISCMKBKFQXDAMRUGY4DUPB7JZX";


const SHORT_KEY = PUBLIC_KEY.slice(0, 6) + "..." + PUBLIC_KEY.slice(-6);


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
 
  stellar.isFreighterAvailable.mockResolvedValue(true);
  stellar.getOpenTrip.mockResolvedValue(null);
  stellar.getBalance.mockResolvedValue(0);
  stellar.hasClaimedFaucet.mockResolvedValue(true); 
  stellar.getAccountHistory.mockResolvedValue([]);
});

describe("initial render", () => {
  it("shows the Book trip tab by default and all nav items", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Book trip" })).toBeInTheDocument();
    
    ["Book trip", "Tap card", "Wallet", "Activity", "Chain history"].forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
    
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