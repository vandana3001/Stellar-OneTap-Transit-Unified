# Stellar One-Tap Travel Transit Unified

> A Soroban (Stellar smart contract) dApp for tap-in / tap-out public transit fares — one on-chain fare token, one operator/fare registry, and one trip controller that holds a rider's fare and settles it automatically at tap-out, all driven from a Freighter-connected React frontend.

---

## Live Deployed Project Link

**https://stellar-one-tap-transit-unified.vercel.app/**



---

## Demo Video

**https://www.youtube.com/watch?v=n152TnMjBew**

---

## Contract Addresses Explorer Link

| Contract | Address | Explorer |
|---|---|---|
| **Fare Token** (`FareToken`) | `CDZNJOQUQHITXCVO3XYKEUG5PSC5H56DFXNUB5VQT7PYVMG6N4QX3E35` | [View on stellar.expert](https://stellar.expert/explorer/testnet/contract/CDZNJOQUQHITXCVO3XYKEUG5PSC5H56DFXNUB5VQT7PYVMG6N4QX3E35) |
| **Operator Registry** (`OperatorRegistry`) | `CBLJAOBD74WG75D5TOCVEIHQ7CTVU7DCJEEA5YGVFQ6MMCMFI6ME72OZ` | [View on stellar.expert](https://stellar.expert/explorer/testnet/contract/CBLJAOBD74WG75D5TOCVEIHQ7CTVU7DCJEEA5YGVFQ6MMCMFI6ME72OZ) |
| **Transit Controller** (`TransitController`) | `CATTPBDRTCJTKB4YWT3CCCBGG2SI7QQ2CCOQTJY5WKKGKQEEGJM7SCRR` | [View on stellar.expert](https://stellar.expert/explorer/testnet/contract/CATTPBDRTCJTKB4YWT3CCCBGG2SI7QQ2CCOQTJY5WKKGKQEEGJM7SCRR) |



---

## Inter-Contract Communication Transaction Hash

**https://stellar.expert/explorer/testnet/tx/578aa532ba65cf121bbf00590b2d0d992ce145a52c9e7d1a7d54b5dcc7e3c0b4**
**https://stellar.expert/explorer/testnet/tx/a4d08fd54544cff0b1085020ab9010c1f2241c86a2957694e3d2f19dfb4d04ce**



---

## PPT Link

**https://docs.google.com/presentation/d/1tJCBMhQmylPN03WonqyQ-T-suQkZKL7e/edit?usp=sharing&ouid=107233345488322501855&rtpof=true&sd=true**

---

## Screenshots

### Contract Deployment

| Fare Token | Operator Registry | Transit Controller |
|---|---|---|
| <img width="1896" height="426" alt="fare-token-deployed" src="https://github.com/user-attachments/assets/0d80d08e-0ac0-474d-bb85-afb866257315" /> | <img width="1887" height="422" alt="operator-registry-deployed" src="https://github.com/user-attachments/assets/f77225bb-c9d0-4ca4-a2f6-163eb15d14ff" /> | <img width="1887" height="425" alt="transit-controller-deployed" src="https://github.com/user-attachments/assets/34d622fd-8136-4fea-a12a-f6ca67986351" /> |

### Mobile Responsive View

<p>
  <img width="240" alt="mobile-1" src="https://github.com/user-attachments/assets/b06aba3a-29a1-4c7f-8db5-6b9d50113d17" />
  <img width="240" alt="mobile-2" src="https://github.com/user-attachments/assets/a8e3a442-24c1-4a04-91f3-b0a9afbe74d8" />
  <img width="240" alt="mobile-3" src="https://github.com/user-attachments/assets/3089a551-5f80-40fb-a5d7-dd40a85b9f4f" />
</p>

### Error Handling & Loading States

<p>
  <img width="600" alt="loading-1" src="https://github.com/user-attachments/assets/ab8c44ae-b45c-4cfe-b29e-b8d626e269ec" />
  <img width="600" alt="loading-2" src="https://github.com/user-attachments/assets/a00ea261-b3ad-4e69-9666-8d9259c5761b" />
</p>
<p>
  <img width="600" alt="error-1" src="https://github.com/user-attachments/assets/467045ba-39d3-4bb6-a753-2ad6e92b7b18" />
</p>

### Contract Invoke (tap in / tap out)
 
<img width="900" alt="contract_invoke" src="https://github.com/user-attachments/assets/44fd48ec-7c3e-4318-a33f-29cd7edec1ca" />
<img width="700" alt="inter-contract" src="https://github.com/user-attachments/assets/7ad4669f-b0cd-4280-a8de-2d1a2aa918e6" />

### Event streaming & real-time updates
 
<img width="1362" height="292" alt="eventstreaming" src="https://github.com/user-attachments/assets/d75f968a-fb25-4a69-b468-5cf80e145b3c" />

### Contract Tests
 
<p>
  <img width="600" alt="contract-tests-1" src="https://github.com/user-attachments/assets/0b62bb2c-bc60-4cd9-a274-abe9b18e01b9" />
  <img width="600" alt="contract-tests-2" src="https://github.com/user-attachments/assets/2f4b3efa-2124-4ec5-9a1d-474ff0e57fd1" />
  <img width="600" alt="contract-tests-3" src="https://github.com/user-attachments/assets/ca375604-7e83-4c8e-b827-551b019082e2" />
</p>

### Frontend Tests
 
<img width="700" alt="frontend-test-cases" src="https://github.com/user-attachments/assets/2d3d7cc6-fdcd-48a1-9177-62366fafa86a" />

### CI/CD Pipeline Running
 
<img width="900" alt="ci-cd" src="https://github.com/user-attachments/assets/8f5f18d8-eb13-4c80-9fcd-c8860b23fb12" />

---
 

## Overview

**Stellar Transit** models a "tap card" public transit system entirely on-chain: a rider taps in at a station, the contract holds the operator's maximum fare from the rider's balance, and when the rider taps out at their destination the contract looks up the real point-to-point fare, charges only that amount, and refunds the difference — automatically, atomically, in a single settlement contract.

| Station | What happens | On-chain action |
|---|---|---|
| **Book Trip** | Rider picks an operator, entry and exit station | (read-only — sets up the tap) |
| **Tap Card — Tap In** | Rider opens a trip; the controller checks the operator is active, pulls the operator's max fare from the registry, and escrows that amount from the rider's `FareToken` balance | `TransitController.tap_in` (cross-contract calls into `OperatorRegistry` + `FareToken`) |
| **Tap Card — Tap Out** | Rider closes the trip; the controller looks up the real entry→exit fare (falling back to max fare if unconfigured), pays the operator, and refunds the rider the difference | `TransitController.tap_out` (cross-contract calls into `OperatorRegistry` + `FareToken`) |
| **Wallet** | Connect Freighter, view `FARE` balance, claim a one-time starter faucet | `FareToken.claim_faucet` / `balance` |
| **Chain History** | Live feed of every Horizon operation for the connected address | Horizon `operations` REST + SSE stream |

Every state-changing call is a Freighter-signed Soroban transaction, and every transition (`mint`, `faucet`, `transfer`, `burn`, `tap_in`, `tap_out`, `op_reg`, `fare_upd`, `op_status`) emits a contract event.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                          React Frontend                            │
│  ┌───────────┐  ┌────────────┐  ┌───────────┐  ┌────────────────┐ │
│  │ Book Trip │  │  Tap Card  │  │  Wallet   │  │ Chain History   │ │
│  │  (select) │  │ (tap_in/   │  │ (connect, │  │ (Horizon feed + │ │
│  │           │  │  tap_out)  │  │  faucet)  │  │  live stream)   │ │
│  └─────┬─────┘  └─────┬──────┘  └─────┬─────┘  └────────┬────────┘ │
│        └──────────────┴───────────────┴─────────────────┘         │
│                       Freighter Wallet (signing)                    │
│                Soroban RPC (simulate / prepare / submit)            │
└──────────────────────────────┬──────────────────────────────────────┘
                                │ JSON-RPC (Soroban) + Horizon REST/SSE
                ┌───────────────┴─────────────────┐
                ▼                                    ▼
   ┌────────────────────────┐          ┌──────────────────────────┐
   │   OperatorRegistry       │◄────────►│   TransitController       │
   │ operators, fares, active │  cross-  │ tap_in / tap_out          │
   │ status (source of truth) │ contract │ escrow + settlement logic │
   └────────────────────────┘   call    └────────────┬─────────────┘
                                                       │ cross-contract call
                                                       ▼
                                          ┌──────────────────────────┐
                                          │        FareToken          │
                                          │ balances, mint/burn,      │
                                          │ transfer, faucet          │
                                          └──────────────────────────┘
                                    Stellar Testnet
```

**Why three contracts instead of one?** Each contract owns exactly one responsibility: `FareToken` is a self-contained fungible token (balances, mint/burn, transfer, one-time faucet); `OperatorRegistry` is the source of truth for which operators exist, whether they're active, and what a given station pair costs; `TransitController` contains zero balance or fare state of its own — it only orchestrates a trip by calling out to the other two. This means the registry can be updated (new operators, new fares, deactivating an operator) without redeploying the settlement logic, and the token can, in principle, back other controllers besides transit.

---

## Smart Contracts

All three contracts are written in Rust using `soroban-sdk` and compiled to WASM for the Soroban runtime.

### 1. `FareToken`

A minimal fungible token used to hold and settle fares.

| Function | Description |
|---|---|
| `initialize(admin, decimals, name, symbol)` | One-time setup; sets the admin and starts `total_supply` at 0. |
| `mint(to, amount)` | Admin-only mint; increases balance and total supply. Rejects non-positive amounts. |
| `claim_faucet(to)` | One-time self-serve faucet (500 `FARE`) per address; tracked via `FaucetClaimed(Address)` so it can't be claimed twice. |
| `transfer(from, to, amount)` | Standard balance-to-balance transfer, authorized by `from`. |
| `burn(from, amount)` | Burns from a balance and reduces total supply; fails on insufficient balance. |
| `balance(id)` / `has_claimed_faucet(id)` / `total_supply()` | Read-only views. |

Storage uses `env.storage().persistent()` for `Balance(Address)` and `FaucetClaimed(Address)`, and `env.storage().instance()` for admin/config/total supply.

### 2. `OperatorRegistry`

Source-of-truth contract for transit operators and their fare matrices.

| Function | Description |
|---|---|
| `initialize(admin)` | One-time setup. |
| `register_operator(operator_id, name, wallet, max_fare)` | Admin-only; registers an operator with a payout wallet and a ceiling fare (used as the tap-in hold amount and as the fallback fare). |
| `set_fare(operator_id, from_station, to_station, fare)` | Admin-only; sets a specific point-to-point fare for an operator. |
| `set_active(operator_id, active)` | Admin-only; toggles whether an operator can be tapped into. |
| `get_operator` / `is_active` / `get_max_fare` / `get_wallet` | Read-only views, `is_active` defaults to `false` for unknown operators rather than panicking. |
| `get_fare(operator_id, from_station, to_station)` | Returns the configured fare for a station pair, or the operator's `max_fare` if that pair hasn't been priced yet. |

Storage keys: `DataKey::Operator(Symbol)` and `DataKey::Fare(Symbol, Symbol, Symbol)` (operator, from-station, to-station), both in `persistent()` storage.

### 3. `TransitController`

Stateless orchestrator that holds no fare data of its own — every fare and status check is a live cross-contract call.

| Function | Description |
|---|---|
| `initialize(admin, registry_addr, token_addr)` | One-time setup; stores the addresses of the two dependency contracts. |
| `tap_in(rider, operator_id, entry_station)` | Rejects if the rider already has an open trip or the operator is inactive; otherwise reads `max_fare` from the registry, transfers that amount from the rider into the controller as an escrow hold, and stores a `TripState` in **temporary** storage with a 100/17,280-ledger TTL extension. |
| `tap_out(rider, exit_station)` | Reads the open `TripState`, looks up the real fare and the operator's payout wallet from the registry, charges the operator `min(real_fare, hold_amount)`, refunds the rider the remainder, and clears the trip. |
| `get_open_trip(rider)` | Read-only view of a rider's current `TripState`, if any. |

`TripState` is deliberately stored in `temporary()` storage (not `persistent()`) since an open trip is a short-lived, session-scoped object rather than permanent ledger state.

---

## Inter-Contract Communication

`TransitController` never duplicates fare or balance logic — every tap calls directly into the deployed `OperatorRegistry` and `FareToken` contracts at runtime via generated `#[contractclient]` clients:

```rust
#[contractclient(name = "RegistryClient")]
pub trait RegistryInterface {
    fn is_active(env: Env, operator_id: Symbol) -> bool;
    fn get_max_fare(env: Env, operator_id: Symbol) -> i128;
    fn get_wallet(env: Env, operator_id: Symbol) -> Address;
    fn get_fare(env: Env, operator_id: Symbol, from_station: Symbol, to_station: Symbol) -> i128;
}

#[contractclient(name = "TokenClient")]
pub trait TokenInterface {
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
    fn balance(env: Env, id: Address) -> i128;
}
```

`tap_in` calls `RegistryClient::is_active` + `get_max_fare`, then `TokenClient::transfer` to escrow funds from the rider into the controller's own contract address. `tap_out` calls `RegistryClient::get_fare` + `get_wallet`, then makes **two** further `TokenClient::transfer` calls — one paying the operator, one refunding the rider — all within a single signed transaction. This is genuine Soroban inter-contract invocation across three independently deployed contracts, exercised directly in the Rust integration test harness (`test_full_tap_in_tap_out_flow_with_refund` and friends, which deploy all three contracts inside one `Env` and assert on cross-contract state changes).

---

## Event Streaming & Real-Time Updates

Every mutating contract call publishes a Soroban event:

```rust
env.events().publish((symbol_short!("mint"), to), amount);
env.events().publish((symbol_short!("faucet"), to), FAUCET_AMOUNT);
env.events().publish((symbol_short!("transfer"), from, to), amount);
env.events().publish((symbol_short!("burn"), from), amount);
env.events().publish((symbol_short!("op_reg"), operator_id), (wallet, max_fare));
env.events().publish((symbol_short!("fare_upd"), operator_id), (from_station, to_station, fare));
env.events().publish((symbol_short!("op_status"), operator_id), active);
env.events().publish((symbol_short!("tap_in"), rider, operator_id), (entry_station, hold_amount));
env.events().publish((symbol_short!("tap_out"), rider, trip.operator_id), (exit_station, charged, refund));
```

On the frontend, `stellar.js` loads the initial 20 operations for the connected address from **Horizon** (`getAccountHistory`) and then opens a live **Server-Sent Events** stream (`streamAccountHistory`, `cursor=now`) against Horizon's `/accounts/{id}/operations` endpoint. New operations are prepended to the in-memory history list in real time, deduplicated by operation ID, and a "Live" pill lights up in the Chain History tab the moment the stream delivers its first event. Each operation is decoded client-side (`describeOperation`) to turn raw invocation parameters back into a human label like "Tap in on Delhi Metro at RAJIV_CHK" or "Tap out at HUDA_CITY", and every row links out to **stellar.expert** for full transaction inspection.

---

## Frontend

Built with **React** (Vite) and the official `@stellar/stellar-sdk` + `@stellar/freighter-api` packages — no backend server; all reads are RPC simulations and all writes are wallet-signed transactions submitted directly from the browser.

Key modules:

- `stellar.js` — Freighter connect/detect, `invokeContract` (simulate → sign → submit → poll), `simulateRead` for free read-only calls, faucet/balance/trip helpers, and the Horizon history + SSE streaming layer
- `config.js` — network passphrase, RPC/Horizon URLs, contract IDs (env-overridable), operator + station lists
- `App.jsx` — five-tab shell (**Book trip**, **Tap card**, **Wallet**, **Activity**, **Chain history**) with a sidebar nav on desktop and a horizontally-scrolling pill nav on mobile
  - **Book trip** — operator/station pickers with a live route timeline showing entry/exit tags
  - **Tap card** — the "physical card" view: monogrammed operator card, open/ready status pill, single primary tap button that flips between tap-in and tap-out
  - **Wallet** — Freighter connection state, balance, one-time starter faucet
  - **Activity** — current trip status plus a session-local timeline of taps made this session
  - **Chain history** — full Horizon operation feed with a live-streaming indicator

---

## Error Handling & Loading States

Every on-chain interaction follows the same defensive pattern:

1. **Simulate/prepare** the transaction first (`server.prepareTransaction`) so bad calls are caught before ever prompting the wallet.
2. **Sign** via Freighter, explicitly checking `signedResult.error` (covers user rejection or a locked wallet).
3. **Submit** and poll `server.getTransaction` (up to 15 attempts / ~15s) until status leaves `NOT_FOUND`.
4. Every `catch` block wraps the underlying SDK/RPC error in a contextual message (`"Simulation failed: ..."`, `"Transaction signing was cancelled or failed: ..."`, `"Transaction did not succeed on-chain: ..."`) via `extractContractError()`, rather than surfacing raw SDK output.

Loading states are staged and non-blocking rather than a single spinner:

- Trip status and balance each have **independent** sync state (`tripSyncing`/`tripSyncError`, `balanceSyncing`/`balanceSyncError`) with their own inline `Retry` button, so a failure in one panel never blocks the other.
- Chain history shows a loading spinner on first load, an inline error + Retry on failure, and an empty-state message when a wallet genuinely has no on-chain activity yet.
- The primary tap button and station selectors are **disabled** (not hidden) whenever a prerequisite is missing (no wallet connected, a trip already open, a sync in flight), so the UI always explains why an action is unavailable rather than letting a rider retry a doomed action.
- The starter faucet claims automatically and silently the first time a connected wallet is found to have a zero balance, with its own loading/success/error copy in the Wallet tab.

---

## CI/CD Pipeline

`.github/workflows/ci.yml` runs a single job on every push/PR to `main` (and on manual dispatch), scoped to the `frontend/` working directory:

```
Checkout → Setup Node 20 → Install deps → Lint → Test → Build → Upload build artifact
```

1. **Install** — `npm ci` if a lockfile is present, otherwise `npm install`.
2. **Lint** — `npm run lint --if-present`.
3. **Test** — `npm test --if-present -- --run` (Vitest, non-watch mode).
4. **Build** — `npm run build --if-present`.
5. **Upload artifact** — the production `dist/` output is uploaded as a build artifact (7-day retention) for inspection, gated on the previous steps succeeding.

`concurrency` is configured per-branch so superseded pushes automatically cancel their in-flight CI run instead of queueing.

---

## Deployment Workflow

### Smart contracts (Soroban CLI)

```bash
# Build optimized WASM for all three contracts
stellar contract build

# Deploy FareToken
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/fare_token.wasm \
  --source <YOUR_IDENTITY> \
  --network testnet

# Deploy OperatorRegistry
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/operator_registry.wasm \
  --source <YOUR_IDENTITY> \
  --network testnet

# Deploy TransitController (needs both addresses above at init time)
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/transit_controller.wasm \
  --source <YOUR_IDENTITY> \
  --network testnet
```

Initialize each contract (order matters — the controller needs the other two addresses):

```bash
stellar contract invoke --id <FARE_TOKEN_ID> --network testnet --source <ADMIN> -- \
  initialize --admin <ADMIN> --decimals 2 --name "Stellar Transit Fare" --symbol "FARE"

stellar contract invoke --id <REGISTRY_ID> --network testnet --source <ADMIN> -- \
  initialize --admin <ADMIN>

stellar contract invoke --id <CONTROLLER_ID> --network testnet --source <ADMIN> -- \
  initialize --admin <ADMIN> --registry_addr <REGISTRY_ID> --token_addr <FARE_TOKEN_ID>
```

Copy the resulting `C...` contract IDs into `frontend/src/config.js` (or set the matching `VITE_*` env vars):

```js
export const CONTRACTS = {
  operatorRegistry: "C...",
  fareToken: "C...",
  transitController: "C...",
};
```

### Frontend (Netlify/Vercel, via CI/CD)

Pushing to `main` triggers the GitHub Actions pipeline above (lint → test → build). Deploy the built `dist/` to your host of choice:

```bash
cd frontend
npm ci
npm run build
netlify deploy --build --prod
# or: vercel --prod
```

---

## Testing

### Contract tests (Rust)

```bash
cd contracts/fare-token          && cargo test
cd contracts/operator-registry   && cargo test
cd contracts/transit-controller  && cargo test
```

Coverage includes:

- **FareToken** — mint increases balance/supply, transfer moves balance without affecting supply, transfer fails on insufficient balance, burn reduces balance/supply, double-initialize fails.
- **OperatorRegistry** — register + read back an operator, double-initialize fails, fare matrix lookup with fallback to `max_fare` for unconfigured station pairs (and no fallback leakage in the reverse direction), deactivating an operator, unknown operator reads `false`/`OperatorNotFound` instead of panicking.
- **TransitController** — full tap-in → tap-out flow with correct refund, fare capped at the tap-in hold amount, fallback to max fare for an unconfigured station pair, rejecting a second tap-in while a trip is open, rejecting tap-out with no open trip, rejecting tap-in for an inactive operator, and re-tapping-in successfully after a completed trip. All exercised against real, independently-deployed `FareToken` and `OperatorRegistry` contracts inside one `Env` (`env.mock_all_auths()`), proving genuine cross-contract behavior rather than mocked stubs.

### Frontend tests (Vitest + React Testing Library)

```bash
cd frontend
npm install
npx vitest run
```

Coverage includes: default tab rendering and nav, wallet-gated views on the Tap Card/Activity/Chain History tabs, the full connect flow (loading → success → error), immediate trip/balance sync after connecting, independent loading spinners and error/Retry affordances for trip sync, balance sync, and chain history, live-streamed history updates, and failed-operation pills in the history feed.

---

## Getting Started Locally

```bash
git clone https://github.com/<your-org>/stellar-transit.git
cd stellar-transit/frontend
npm install
npm run dev
```

Requirements: Node 20+, the [Freighter](https://freighter.app) browser extension set to **Testnet**, and testnet XLM (fund via [Friendbot](https://friendbot.stellar.org)) so your address can pay transaction fees before claiming the in-app `FARE` faucet.

---

## Project Structure

```
.
├── .github/workflows/ci.yml           # CI pipeline (lint, test, build)
├── contracts/
│   ├── fare-token/                    # FareToken contract + tests
│   ├── operator-registry/             # OperatorRegistry contract + tests
│   └── transit-controller/            # TransitController contract + cross-contract tests
└── frontend/
    ├── src/
    │   ├── App.jsx                    # tab shell: book / card / wallet / activity / history
    │   ├── App.css                    # design tokens + layout
    │   ├── config.js                  # contract IDs / network constants / operators & stations
    │   ├── stellar.js                 # RPC + Horizon helpers, invoke/simulate/stream
    │   ├── main.jsx
    │   ├── index.css
    │   └── __tests__/App.test.jsx
    └── package.json
```
