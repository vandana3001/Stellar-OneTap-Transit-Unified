#![no_std]


#![allow(dead_code)]
use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, symbol_short, Address,
    Env, Symbol,
};


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

#[derive(Clone)]
#[contracttype]
pub struct TripState {
    pub operator_id: Symbol,
    pub entry_station: Symbol,
    pub hold_amount: i128,
    pub entry_ledger_ts: u64,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    RegistryAddr,
    TokenAddr,
    Trip(Address), 
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ControllerError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    OperatorInactive = 3,
    TripAlreadyOpen = 4,
    NoOpenTrip = 5,
    RegistryCallFailed = 6,
    TokenCallFailed = 7,
}

#[contract]
pub struct TransitController;

#[contractimpl]
impl TransitController {
    pub fn initialize(
        env: Env,
        admin: Address,
        registry_addr: Address,
        token_addr: Address,
    ) -> Result<(), ControllerError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ControllerError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::RegistryAddr, &registry_addr);
        env.storage().instance().set(&DataKey::TokenAddr, &token_addr);
        Ok(())
    }

    
    pub fn tap_in(
        env: Env,
        rider: Address,
        operator_id: Symbol,
        entry_station: Symbol,
    ) -> Result<(), ControllerError> {
        rider.require_auth();

        if env
            .storage()
            .temporary()
            .has(&DataKey::Trip(rider.clone()))
        {
            return Err(ControllerError::TripAlreadyOpen);
        }

        let registry = Self::registry_client(&env);
        if !registry.is_active(&operator_id) {
            return Err(ControllerError::OperatorInactive);
        }
        let hold_amount = registry.get_max_fare(&operator_id);

        
        let token = Self::token_client(&env);
        let this_contract = env.current_contract_address();
        token.transfer(&rider, &this_contract, &hold_amount);

        let trip = TripState {
            operator_id: operator_id.clone(),
            entry_station: entry_station.clone(),
            hold_amount,
            entry_ledger_ts: env.ledger().timestamp(),
        };
        env.storage()
            .temporary()
            .set(&DataKey::Trip(rider.clone()), &trip);
        
        env.storage()
            .temporary()
            .extend_ttl(&DataKey::Trip(rider.clone()), 100, 17_280);

        env.events().publish(
            (symbol_short!("tap_in"), rider, operator_id),
            (entry_station, hold_amount),
        );

        Ok(())
    }

   
    pub fn tap_out(
        env: Env,
        rider: Address,
        exit_station: Symbol,
    ) -> Result<i128, ControllerError> {
        rider.require_auth();

        let trip: TripState = env
            .storage()
            .temporary()
            .get(&DataKey::Trip(rider.clone()))
            .ok_or(ControllerError::NoOpenTrip)?;

        let registry = Self::registry_client(&env);
        let real_fare = registry.get_fare(&trip.operator_id, &trip.entry_station, &exit_station);
        let operator_wallet = registry.get_wallet(&trip.operator_id);

        
        let charged = if real_fare > trip.hold_amount {
            trip.hold_amount
        } else {
            real_fare
        };
        let refund = trip.hold_amount - charged;

        let token = Self::token_client(&env);
        let this_contract = env.current_contract_address();

        if charged > 0 {
            token.transfer(&this_contract, &operator_wallet, &charged);
        }
        if refund > 0 {
            token.transfer(&this_contract, &rider, &refund);
        }

        env.storage().temporary().remove(&DataKey::Trip(rider.clone()));

        env.events().publish(
            (symbol_short!("tap_out"), rider, trip.operator_id),
            (exit_station, charged, refund),
        );

        Ok(charged)
    }

    pub fn get_open_trip(env: Env, rider: Address) -> Option<TripState> {
        env.storage().temporary().get(&DataKey::Trip(rider))
    }

    fn registry_client(env: &Env) -> RegistryClient {
        let addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::RegistryAddr)
            .expect("controller not initialized");
        RegistryClient::new(env, &addr)
    }

    fn token_client(env: &Env) -> TokenClient {
        let addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenAddr)
            .expect("controller not initialized");
        TokenClient::new(env, &addr)
    }
}

#[cfg(test)]
mod test;
