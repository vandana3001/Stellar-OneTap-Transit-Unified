import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";
import * as stellar from "./stellar";

// A syntactically valid (StrKey-checksummed) but unfunded test public key -
// generated once with Keypair.random() outside the jsdom test environment,
// since @noble/ed25519's RNG path doesn't play well with jsdom's crypto shim.
const TEST_PUBLIC_KEY = "GDBH2T35AHN77DXYNZDWHNULIOMEQHTB2WMPFK7727QPP33S6AGYIJZ3";

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a hint to install Freighter when it is not detected", () => {
    vi.spyOn(stellar, "isFreighterAvailable").mockReturnValue(false);
    render(<App />);
    expect(screen.getByText(/Freighter extension not detected/i)).toBeInTheDocument();
  });

  it("disables Tap In until a wallet is connected", () => {
    vi.spyOn(stellar, "isFreighterAvailable").mockReturnValue(true);
    render(<App />);
    const tapInBtn = screen.getByRole("button", { name: /tap in/i });
    expect(tapInBtn).toBeDisabled();
  });

  it("shows an error message if wallet connection fails", async () => {
    vi.spyOn(stellar, "isFreighterAvailable").mockReturnValue(true);
    vi.spyOn(stellar, "connectWallet").mockRejectedValue(
      new Error("Freighter wallet not found. Install it from freighter.app and refresh the page.")
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /connect freighter/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Freighter wallet not found/i);
    });
  });

  it("enables Tap In and disables Tap Out right after a successful wallet connect", async () => {
    vi.spyOn(stellar, "isFreighterAvailable").mockReturnValue(true);
    vi.spyOn(stellar, "connectWallet").mockResolvedValue(
      TEST_PUBLIC_KEY
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /connect freighter/i }));

    await waitFor(() => {
      expect(screen.getByText(/Connected:/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /tap in/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /tap out/i })).toBeDisabled();
  });

  it("shows a confirmation link with the tx hash after a successful tap-in", async () => {
    vi.spyOn(stellar, "isFreighterAvailable").mockReturnValue(true);
    vi.spyOn(stellar, "connectWallet").mockResolvedValue(
      TEST_PUBLIC_KEY
    );
    vi.spyOn(stellar, "invokeContract").mockResolvedValue({
      hash: "deadbeefcafefeed00112233445566778899aabbccddeeff",
      result: { status: "SUCCESS" },
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /connect freighter/i }));
    await waitFor(() => screen.getByText(/Connected:/i));

    fireEvent.click(screen.getByRole("button", { name: /tap in/i }));

    await waitFor(() => {
      expect(screen.getByText(/Confirmed\. Tx:/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /tap out/i })).toBeEnabled();
  });
});
