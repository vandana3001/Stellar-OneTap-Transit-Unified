#![cfg(test)]

use super::*;
use fare_token::{FareToken, FareTokenClient};
use operator_registry::{OperatorRegistry, OperatorRegistryClient};
use soroban_sdk::{testutils::Address as _, Env, String};

struct Harness {
    env: Env,
    controller: TransitControllerClient<'static>,
    registry: OperatorRegistryClient<'static>,
    token: FareTokenClient<'static>,
    admin: Address,
    rider: Address,
    operator_wallet: Address,
}

fn setup() -> Harness {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let rider = Address::generate(&env);
    let operator_wallet = Address::generate(&env);

    // Deploy operator-registry
    let registry_id = env.register_contract(None, OperatorRegistry);
    let registry = OperatorRegistryClient::new(&env, &registry_id);
    registry.initialize(&admin);

    // Deploy fare-token
    let token_id = env.register_contract(None, FareToken);
    let token = FareTokenClient::new(&env, &token_id);
    token.initialize(
        &admin,
        &2,
        &String::from_str(&env, "Stellar Transit Fare"),
        &String::from_str(&env, "FARE"),
    );

    // Deploy transit-controller, wired to both
    let controller_id = env.register_contract(None, TransitController);
    let controller = TransitControllerClient::new(&env, &controller_id);
    controller.initialize(&admin, &registry_id, &token_id);

    // Onboard a metro operator: DL_METRO, max_fare = 3000 (i.e. Rs 30.00
    // in paise-like smallest units), and one station-pair fare.
    registry.register_operator(
        &Symbol::new(&env, "DL_METRO"),
        &Symbol::new(&env, "DelhiMetro"),
        &operator_wallet,
        &3000,
    );
    registry.set_fare(
        &Symbol::new(&env, "DL_METRO"),
        &Symbol::new(&env, "RAJIV_CHK"),
        &Symbol::new(&env, "HUDA_CITY"),
        &1800,
    );

    // Fund the rider with 10000 FARE tokens (top-up simulation).
    token.mint(&rider, &10000);

    Harness {
        env,
        controller,
        registry,
        token,
        admin,
        rider,
        operator_wallet,
    }
}

#[test]
fn test_full_tap_in_tap_out_flow_with_refund() {
    let h = setup();

    // Tap in: should hold max_fare (3000) from rider's balance.
    h.controller.tap_in(
        &h.rider,
        &Symbol::new(&h.env, "DL_METRO"),
        &Symbol::new(&h.env, "RAJIV_CHK"),
    );

    assert_eq!(h.token.balance(&h.rider), 10000 - 3000);
    let trip = h.controller.get_open_trip(&h.rider).unwrap();
    assert_eq!(trip.hold_amount, 3000);

    // Tap out at HUDA_CITY: real fare configured is 1800, so rider
    // should be refunded 3000 - 1800 = 1200, operator wallet should
    // receive exactly 1800.
    let charged = h
        .controller
        .tap_out(&h.rider, &Symbol::new(&h.env, "HUDA_CITY"));

    assert_eq!(charged, 1800);
    assert_eq!(h.token.balance(&h.operator_wallet), 1800);
    // rider paid net 1800 total: 10000 - 1800 = 8200
    assert_eq!(h.token.balance(&h.rider), 10000 - 1800);
    // trip should be cleared
    assert!(h.controller.get_open_trip(&h.rider).is_none());
}

#[test]
fn test_tap_out_falls_back_to_max_fare_for_unconfigured_station_pair() {
    let h = setup();

    h.controller.tap_in(
        &h.rider,
        &Symbol::new(&h.env, "DL_METRO"),
        &Symbol::new(&h.env, "RAJIV_CHK"),
    );

    // Exit station with no specific fare set -> registry falls back to
    // max_fare (3000), so refund should be zero.
    let charged = h
        .controller
        .tap_out(&h.rider, &Symbol::new(&h.env, "UNKNOWN_STN"));

    assert_eq!(charged, 3000);
    assert_eq!(h.token.balance(&h.operator_wallet), 3000);
    assert_eq!(h.token.balance(&h.rider), 10000 - 3000);
}

#[test]
fn test_cannot_tap_in_twice_without_tapping_out() {
    let h = setup();
    let op = Symbol::new(&h.env, "DL_METRO");
    let station = Symbol::new(&h.env, "RAJIV_CHK");

    h.controller.tap_in(&h.rider, &op, &station);
    let result = h.controller.try_tap_in(&h.rider, &op, &station);

    assert_eq!(result, Err(Ok(ControllerError::TripAlreadyOpen)));
}

#[test]
fn test_tap_out_without_open_trip_fails() {
    let h = setup();
    let result = h
        .controller
        .try_tap_out(&h.rider, &Symbol::new(&h.env, "HUDA_CITY"));
    assert_eq!(result, Err(Ok(ControllerError::NoOpenTrip)));
}

#[test]
fn test_tap_in_rejected_for_inactive_operator() {
    let h = setup();

    h.registry.set_active(&Symbol::new(&h.env, "DL_METRO"), &false);

    let result = h.controller.try_tap_in(
        &h.rider,
        &Symbol::new(&h.env, "DL_METRO"),
        &Symbol::new(&h.env, "RAJIV_CHK"),
    );
    assert_eq!(result, Err(Ok(ControllerError::OperatorInactive)));
}

#[test]
fn test_rider_can_tap_in_again_after_tapping_out() {
    let h = setup();
    let op = Symbol::new(&h.env, "DL_METRO");

    h.controller
        .tap_in(&h.rider, &op, &Symbol::new(&h.env, "RAJIV_CHK"));
    h.controller
        .tap_out(&h.rider, &Symbol::new(&h.env, "HUDA_CITY"));

    // Second ride on the same day should work fine.
    h.controller
        .tap_in(&h.rider, &op, &Symbol::new(&h.env, "HUDA_CITY"));
    assert!(h.controller.get_open_trip(&h.rider).is_some());
}
