#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env};

fn setup(env: &Env) -> (OperatorRegistryClient, Address) {
    let contract_id = env.register_contract(None, OperatorRegistry);
    let client = OperatorRegistryClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    (client, admin)
}

#[test]
fn test_initialize_and_register_operator() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let wallet = Address::generate(&env);

    client.register_operator(
        &Symbol::new(&env, "DL_METRO"),
        &Symbol::new(&env, "DelhiMetro"),
        &wallet,
        &3000, 
    );

    let op = client.get_operator(&Symbol::new(&env, "DL_METRO"));
    assert_eq!(op.max_fare, 3000);
    assert_eq!(op.wallet, wallet);
    assert!(op.active);
}

#[test]
fn test_double_initialize_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, OperatorRegistry);
    let client = OperatorRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin);
    let result = client.try_initialize(&admin);
    assert_eq!(result, Err(Ok(RegistryError::AlreadyInitialized)));
}

#[test]
fn test_fare_matrix_and_fallback_to_max_fare() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let wallet = Address::generate(&env);
    let op_id = Symbol::new(&env, "MUM_METRO");

    client.register_operator(&op_id, &Symbol::new(&env, "MumbaiMetro"), &wallet, &4000);

    
    let station_a = Symbol::new(&env, "ANDHERI");
    let station_b = Symbol::new(&env, "CHURCHGT");
    let fare = client.get_fare(&op_id, &station_a, &station_b);
    assert_eq!(fare, 4000);

    
    client.set_fare(&op_id, &station_a, &station_b, &1500);
    let fare2 = client.get_fare(&op_id, &station_a, &station_b);
    assert_eq!(fare2, 1500);

    
    let fare_reverse = client.get_fare(&op_id, &station_b, &station_a);
    assert_eq!(fare_reverse, 4000);
}

#[test]
fn test_deactivate_operator() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let wallet = Address::generate(&env);
    let op_id = Symbol::new(&env, "BEST_BUS");

    client.register_operator(&op_id, &Symbol::new(&env, "BESTBus"), &wallet, &1000);
    assert!(client.is_active(&op_id));

    client.set_active(&op_id, &false);
    assert!(!client.is_active(&op_id));
}

#[test]
fn test_unknown_operator_is_not_active() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    
    assert!(!client.is_active(&Symbol::new(&env, "GHOST_OP")));
}

#[test]
fn test_get_operator_not_found_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let result = client.try_get_operator(&Symbol::new(&env, "NOPE"));
    assert_eq!(result, Err(Ok(RegistryError::OperatorNotFound)));
}
