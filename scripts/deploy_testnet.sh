#!/usr/bin/env bash
# Deploys Stellar Transit Unified to Stellar Testnet and wires the three
# contracts together. Requires the Stellar CLI (`cargo install --locked
# stellar-cli --features opt`) and a funded testnet identity.
#
# Usage:
#   ./scripts/deploy_testnet.sh <identity-name>
#
# Example:
#   stellar keys generate admin --network testnet
#   stellar keys fund admin --network testnet
#   ./scripts/deploy_testnet.sh admin

set -euo pipefail

IDENTITY="${1:-admin}"
NETWORK="testnet"

echo "==> Building contracts (wasm32-unknown-unknown, release)"
cargo build --target wasm32-unknown-unknown --release

WASM_DIR="target/wasm32-unknown-unknown/release"

echo "==> Optimizing wasm binaries"
stellar contract optimize --wasm "$WASM_DIR/operator_registry.wasm"
stellar contract optimize --wasm "$WASM_DIR/fare_token.wasm"
stellar contract optimize --wasm "$WASM_DIR/transit_controller.wasm"

echo "==> Deploying operator-registry"
REGISTRY_ID=$(stellar contract deploy \
  --wasm "$WASM_DIR/operator_registry.optimized.wasm" \
  --source "$IDENTITY" --network "$NETWORK")
echo "    operator-registry: $REGISTRY_ID"

echo "==> Deploying fare-token"
TOKEN_ID=$(stellar contract deploy \
  --wasm "$WASM_DIR/fare_token.optimized.wasm" \
  --source "$IDENTITY" --network "$NETWORK")
echo "    fare-token: $TOKEN_ID"

echo "==> Deploying transit-controller"
CONTROLLER_ID=$(stellar contract deploy \
  --wasm "$WASM_DIR/transit_controller.optimized.wasm" \
  --source "$IDENTITY" --network "$NETWORK")
echo "    transit-controller: $CONTROLLER_ID"

ADMIN_ADDRESS=$(stellar keys address "$IDENTITY")

echo "==> Initializing operator-registry"
stellar contract invoke --id "$REGISTRY_ID" --source "$IDENTITY" --network "$NETWORK" \
  -- initialize --admin "$ADMIN_ADDRESS"

echo "==> Initializing fare-token"
stellar contract invoke --id "$TOKEN_ID" --source "$IDENTITY" --network "$NETWORK" \
  -- initialize --admin "$ADMIN_ADDRESS" --decimals 2 \
  --name "Stellar Transit Fare" --symbol "FARE"

echo "==> Initializing transit-controller (wiring it to the other two)"
stellar contract invoke --id "$CONTROLLER_ID" --source "$IDENTITY" --network "$NETWORK" \
  -- initialize --admin "$ADMIN_ADDRESS" \
  --registry_addr "$REGISTRY_ID" --token_addr "$TOKEN_ID"

echo "==> Seeding a demo operator: Delhi Metro"
stellar contract invoke --id "$REGISTRY_ID" --source "$IDENTITY" --network "$NETWORK" \
  -- register_operator --operator_id "DL_METRO" --name "DelhiMetro" \
  --wallet "$ADMIN_ADDRESS" --max_fare 3000

stellar contract invoke --id "$REGISTRY_ID" --source "$IDENTITY" --network "$NETWORK" \
  -- set_fare --operator_id "DL_METRO" --from_station "RAJIV_CHK" \
  --to_station "HUDA_CITY" --fare 1800

echo ""
echo "=========================================================="
echo " Deployment complete. Save these into frontend/.env:"
echo "   VITE_REGISTRY_CONTRACT_ID=$REGISTRY_ID"
echo "   VITE_TOKEN_CONTRACT_ID=$TOKEN_ID"
echo "   VITE_CONTROLLER_CONTRACT_ID=$CONTROLLER_ID"
echo "=========================================================="
