#![no_std]


use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Operator {
    pub name: Symbol,
    pub wallet: Address,
    pub max_fare: i128,
    pub active: bool,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Operator(Symbol),                 
    Fare(Symbol, Symbol, Symbol),      
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RegistryError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    OperatorNotFound = 3,
    OperatorInactive = 4,
    FareNotSet = 5,
    NotAuthorized = 6,
}

#[contract]
pub struct OperatorRegistry;

#[contractimpl]
impl OperatorRegistry {
    
    pub fn initialize(env: Env, admin: Address) -> Result<(), RegistryError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(RegistryError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    
    pub fn register_operator(
        env: Env,
        operator_id: Symbol,
        name: Symbol,
        wallet: Address,
        max_fare: i128,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env)?;
        if max_fare <= 0 {
            panic!("max_fare must be positive");
        }

        let operator = Operator {
            name,
            wallet: wallet.clone(),
            max_fare,
            active: true,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Operator(operator_id.clone()), &operator);

        env.events().publish(
            (symbol_short!("op_reg"), operator_id),
            (wallet, max_fare),
        );

        Ok(())
    }

    
    pub fn set_fare(
        env: Env,
        operator_id: Symbol,
        from_station: Symbol,
        to_station: Symbol,
        fare: i128,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env)?;
        Self::get_operator_internal(&env, &operator_id)?; 
        if fare < 0 {
            panic!("fare cannot be negative");
        }

        env.storage().persistent().set(
            &DataKey::Fare(operator_id.clone(), from_station.clone(), to_station.clone()),
            &fare,
        );

        env.events().publish(
            (symbol_short!("fare_upd"), operator_id),
            (from_station, to_station, fare),
        );

        Ok(())
    }

    
    pub fn set_active(env: Env, operator_id: Symbol, active: bool) -> Result<(), RegistryError> {
        Self::require_admin(&env)?;
        let mut op = Self::get_operator_internal(&env, &operator_id)?;
        op.active = active;
        env.storage()
            .persistent()
            .set(&DataKey::Operator(operator_id.clone()), &op);

        env.events()
            .publish((symbol_short!("op_status"), operator_id), active);

        Ok(())
    }


    pub fn get_operator(env: Env, operator_id: Symbol) -> Result<Operator, RegistryError> {
        Self::get_operator_internal(&env, &operator_id)
    }

    pub fn is_active(env: Env, operator_id: Symbol) -> bool {
        match Self::get_operator_internal(&env, &operator_id) {
            Ok(op) => op.active,
            Err(_) => false,
        }
    }

    pub fn get_max_fare(env: Env, operator_id: Symbol) -> Result<i128, RegistryError> {
        Ok(Self::get_operator_internal(&env, &operator_id)?.max_fare)
    }

    pub fn get_wallet(env: Env, operator_id: Symbol) -> Result<Address, RegistryError> {
        Ok(Self::get_operator_internal(&env, &operator_id)?.wallet)
    }

    
    pub fn get_fare(
        env: Env,
        operator_id: Symbol,
        from_station: Symbol,
        to_station: Symbol,
    ) -> Result<i128, RegistryError> {
        let op = Self::get_operator_internal(&env, &operator_id)?;
        let key = DataKey::Fare(operator_id, from_station, to_station);
        Ok(env.storage().persistent().get(&key).unwrap_or(op.max_fare))
    }


    fn require_admin(env: &Env) -> Result<(), RegistryError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(RegistryError::NotInitialized)?;
        admin.require_auth();
        Ok(())
    }

    fn get_operator_internal(env: &Env, operator_id: &Symbol) -> Result<Operator, RegistryError> {
        env.storage()
            .persistent()
            .get(&DataKey::Operator(operator_id.clone()))
            .ok_or(RegistryError::OperatorNotFound)
    }
}

#[cfg(test)]
mod test;
