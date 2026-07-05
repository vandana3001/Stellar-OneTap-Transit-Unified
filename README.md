# Stellar Transit Unified

> **One token. Every ride.**
> An interoperable, blockchain-based fare system for urban transit — a single
> fare token, usable across metro, bus, and toll operators — built on Stellar
> with Soroban smart contracts.

Submission for **Level 3 – Orange Belt: Advanced Smart Contracts + Production-Ready dApps**.

---

## The problem

Transit cards in India (and most countries) are closed-loop: a Delhi Metro
card doesn't work on Mumbai Metro, doesn't work on a BEST bus, and unused
balance is often forfeited rather than refunded. India's NCMC (National
Common Mobility Card) initiative tried to solve this via a shared bank rail,
but rollout is fragmented because every operator still has to integrate with
a card network individually.

**Stellar Transit Unified** replaces that with one fare token that any
operator can accept without integrating with each other — because they're
all just accounts on the same ledger.

## Architecture

Three Soroban contracts, each with a single responsibility, that call each
other on every tap:

```
                         ┌─────────────────────────┐
   rider taps in/out --> │   transit-controller     │  (orchestration)
                         │  tap_in() / tap_out()     │
                         └─────────┬────────┬────────┘
                                   │        │
                      reads fares/ │        │ moves tokens
                      operator info│        │ (hold, settle, refund)
                                   ▼        ▼
                    ┌───────────────────┐  ┌──────────────────┐
                    │ operator-registry │  │    fare-token      │
                    │ (source of truth │  │ (fungible balance) │
                    │  for operators & │  │  mint/transfer/burn│
                    │  fare matrix)     │  └──────────────────┘
                    └───────────────────┘
```

This is **inter-contract communication**, not just three independent
contracts: `transit-controller` never stores fare data or moves tokens on
its own initiative — every tap makes real cross-contract calls to the other
two, using Soroban's `#[contractclient]` pattern (see
`contracts/transit-controller/src/lib.rs`).

### Why a "tap-in hold, tap-out settle" design?

Real metro systems (Delhi Metro, London Underground, Singapore's EZ-Link)
don't know your fare at entry — it depends on your exit station. So they
place a worst-case hold at entry and refund the difference at exit. This
project models that exactly:

1. **`tap_in(rider, operator_id, entry_station)`**
   - `transit-controller` asks `operator-registry.is_active(operator_id)`
   - asks `operator-registry.get_max_fare(operator_id)`
   - calls `fare-token.transfer(rider, controller, max_fare)` — the hold
   - stores a `TripState` (temporary storage, TTL-bounded)
2. **`tap_out(rider, exit_station)`**
   - looks up the open trip
   - asks `operator-registry.get_fare(operator_id, entry, exit)` for the
     real fare
   - `fare-token.transfer(controller, operator_wallet, real_fare)`
   - `fare-token.transfer(controller, rider, hold - real_fare)` — the refund
   - clears the trip, emits a `tap_out` event

Every step above is a real cross-contract call, tested end-to-end in
`contracts/transit-controller/src/test.rs`.

## Repository layout

```
contracts/
  operator-registry/     # onboard operators, fare matrix, admin-gated writes
  fare-token/             # fungible FARE token: mint / transfer / burn
  transit-controller/     # orchestration: tap_in / tap_out, cross-contract calls
frontend/                 # React + Vite dApp (Freighter wallet, tap UI)
scripts/deploy_testnet.sh # one-shot testnet deployment + wiring
.github/workflows/ci.yml   # test -> lint -> frontend build -> deploy
```

## Contracts in detail

### `operator-registry`
Read-heavy, admin-gated. Stores each operator's payout wallet, `max_fare`
(the entry hold), and a per-station-pair fare matrix. `get_fare` falls back
to `max_fare` if a specific pair hasn't been configured, so a newly
onboarded operator works immediately in flat-fare mode.

### `fare-token`
A compact fungible token (mint / balance / transfer / burn) representing
pre-paid transit balance. In production this would be a full SEP-41 token,
or a Stellar classic asset issued through a regulated anchor so it's
redeemable 1:1 for INR. Kept intentionally minimal here so the whole
auth/mint/transfer/burn lifecycle is visible in one file.

### `transit-controller`
The orchestration layer described above. Also the only contract that holds
no independent business data of its own beyond open trips — everything else
is delegated to the other two contracts by design, so operators and fares
can be managed without redeploying this contract.

## Running the tests

```bash
# All three contracts, 17 tests total
cargo test --workspace

# Just the cross-contract integration tests
cargo test -p transit-controller
```

Current status (verified in this repo):

```
operator-registry:    6 passed
fare-token:            5 passed
transit-controller:    6 passed  (full tap_in -> tap_out cross-contract flow)
------------------------------------------------
Total:                17 passed, 0 failed
```

Frontend tests:

```bash
cd frontend
npm test    # 5 passed (wallet connect, error states, tap-in/out gating)
```

## ⚠️ A note on this environment's toolchain

This sandbox ships Rust 1.75 via `apt`, which is too old for the *current*
`crates.io` dependency graph of a few of soroban-sdk's transitive
dependencies (`base64ct`, `zeroize`, `derive_arbitrary` now require Cargo's
`edition2024` feature, which needs a newer `cargo`/`rustc`). I resolved this
by pinning those specific transitive crates to older, compatible versions
in `Cargo.lock` (the lockfile is committed for exactly this reason — do not
delete it). **All 17 contract tests and 5 frontend tests were actually run
and passed in this repo**, not just written speculatively.

I could not build the actual `.wasm` binaries here because that additionally
requires the `wasm32-unknown-unknown` Rust *target*, which is normally
installed via `rustup` — and `rustup`'s installer domain isn't reachable
from this sandbox's network allow-list. On your own machine (or in the
GitHub Actions runner defined in `.github/workflows/ci.yml`, which uses
`dtolnay/rust-toolchain` to install a fresh, current toolchain), this is a
non-issue:

```bash
rustup target add wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown --release
```

## Deploying to Stellar Testnet

1. Install the Stellar CLI: `cargo install --locked stellar-cli --features opt`
2. Create and fund an identity:
   ```bash
   stellar keys generate admin --network testnet
   stellar keys fund admin --network testnet
   ```
3. Run the deployment script, which builds, optimizes, deploys, initializes,
   and wires all three contracts together, then seeds a demo operator
   (Delhi Metro with one station-pair fare):
   ```bash
   ./scripts/deploy_testnet.sh admin
   ```
4. Copy the three printed contract IDs into `frontend/.env`:
   ```
   VITE_REGISTRY_CONTRACT_ID=C...
   VITE_TOKEN_CONTRACT_ID=C...
   VITE_CONTROLLER_CONTRACT_ID=C...
   ```

### Fill in after your deployment

| Contract | Address |
|---|---|
| operator-registry | `PASTE_AFTER_DEPLOY` |
| fare-token | `PASTE_AFTER_DEPLOY` |
| transit-controller | `PASTE_AFTER_DEPLOY` |

| Sample interaction | Tx hash |
|---|---|
| `tap_in` | `PASTE_AFTER_YOU_RUN_ONE` |
| `tap_out` | `PASTE_AFTER_YOU_RUN_ONE` |

## Running the frontend locally

```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
```

Requires the [Freighter](https://freighter.app) browser extension, set to
Testnet, funded via friendbot. The UI:
- connects the wallet (with a clear install prompt if Freighter is missing)
- lets you pick an operator + entry/exit station
- calls `tap_in` / `tap_out` on `transit-controller` via `stellar-sdk`,
  builds/simulates/signs/submits the transaction, and polls for
  confirmation
- shows loading states on every async step and a plain-language error
  message (wallet not installed, signing cancelled, simulation failure,
  transaction rejected) rather than a raw SDK exception
- is mobile-first: single-column card layout, large tap targets, a
  `max-width` container with a wider breakpoint at 600px for desktop

## CI/CD (`.github/workflows/ci.yml`)

Four jobs on every push/PR:
1. **test** — installs a current Rust toolchain + `wasm32-unknown-unknown`,
   runs `cargo test --workspace`, builds release `.wasm` for all three
   contracts, uploads them as build artifacts
2. **lint** — `cargo fmt --check` + `cargo clippy -D warnings`
3. **frontend** — `npm ci`, `npm test`, `npm run build`
4. **deploy-testnet** — on `main` only: installs `stellar-cli`, optimizes
   the wasm, deploys all three contracts to testnet (requires a
   `TESTNET_DEPLOYER_SECRET_KEY` repo secret)

## Roadmap / what's simplified for this submission

- `fare-token` is a hand-rolled fungible token rather than a full
  SEP-41-compliant one — swapping in a compliant implementation (or a
  classic Stellar asset via an anchor) wouldn't change `transit-controller`
  at all, since it only depends on the `transfer`/`balance` interface.
- Real deployments would use a multi-sig or DAO-controlled admin address
  for `operator-registry`/`fare-token`, not a single key.
- Zone-based fare matrices are demoed with a couple of station pairs;
  loading a full fare table is just more `set_fare` calls, no contract
  changes needed.
