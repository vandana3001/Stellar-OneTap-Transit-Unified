#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, String};

fn setup(env: &Env) -> (FareTokenClient, Address) {
    let contract_id = env.register_contract(None, FareToken);
    let client = FareTokenClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(
        &admin,
        &2,
        &String::from_str(env, "Stellar Transit Fare"),
        &String::from_str(env, "FARE"),
    );
    (client, admin)
}

#[test]
fn test_mint_increases_balance_and_supply() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let rider = Address::generate(&env);

    client.mint(&rider, &5000);

    assert_eq!(client.balance(&rider), 5000);
    assert_eq!(client.total_supply(), 5000);
}

#[test]
fn test_transfer_moves_balance_between_accounts() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let rider = Address::generate(&env);
    let operator_wallet = Address::generate(&env);

    client.mint(&rider, &5000);
    client.transfer(&rider, &operator_wallet, &1200);

    assert_eq!(client.balance(&rider), 3800);
    assert_eq!(client.balance(&operator_wallet), 1200);
    // total supply is unaffected by transfers, only mint/burn
    assert_eq!(client.total_supply(), 5000);
}

#[test]
fn test_transfer_fails_on_insufficient_balance() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let rider = Address::generate(&env);
    let operator_wallet = Address::generate(&env);

    client.mint(&rider, &500);
    let result = client.try_transfer(&rider, &operator_wallet, &1200);
    assert_eq!(result, Err(Ok(TokenError::InsufficientBalance)));
}

#[test]
fn test_burn_reduces_balance_and_supply() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let rider = Address::generate(&env);

    client.mint(&rider, &2000);
    client.burn(&rider, &800);

    assert_eq!(client.balance(&rider), 1200);
    assert_eq!(client.total_supply(), 1200);
}

#[test]
fn test_double_initialize_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, FareToken);
    let client = FareTokenClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &2, &String::from_str(&env, "Fare"), &String::from_str(&env, "FARE"));
    let result = client.try_initialize(
        &admin,
        &2,
        &String::from_str(&env, "Fare"),
        &String::from_str(&env, "FARE"),
    );
    assert_eq!(result, Err(Ok(TokenError::AlreadyInitialized)));
}
