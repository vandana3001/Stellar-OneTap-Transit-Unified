#![no_std]


use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env};

const FAUCET_AMOUNT: i128 = 500;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Decimals,
    Name,
    Symbol,
    Balance(Address),
    TotalSupply,
    FaucetClaimed(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TokenError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    InsufficientBalance = 3,
    NegativeAmount = 4,
    AlreadyClaimed = 5,
}

#[contract]
pub struct FareToken;

#[contractimpl]
impl FareToken {
    pub fn initialize(
        env: Env,
        admin: Address,
        decimals: u32,
        name: soroban_sdk::String,
        symbol: soroban_sdk::String,
    ) -> Result<(), TokenError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(TokenError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Decimals, &decimals);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
        Ok(())
    }

    /// Mint new FARE tokens - e.g. triggered off-chain when a rider
    /// tops up via UPI through the anchor. Admin-only.
    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), TokenError> {
        if amount <= 0 {
            return Err(TokenError::NegativeAmount);
        }
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(TokenError::NotInitialized)?;
        admin.require_auth();

        let balance = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &(balance + amount));

        let supply: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(supply + amount));

        env.events()
            .publish((symbol_short!("mint"), to), amount);
        Ok(())
    }

    /// Self-service starter balance for new riders. Anyone can claim
    /// this for their OWN address (require_auth is the claimer, not
    /// the admin), exactly once. This is testnet play money only -
    /// it exists purely so a new user can try the app without needing
    /// the admin to manually mint to them via CLI first.
    pub fn claim_faucet(env: Env, to: Address) -> Result<(), TokenError> {
        to.require_auth();

        if env
            .storage()
            .persistent()
            .has(&DataKey::FaucetClaimed(to.clone()))
        {
            return Err(TokenError::AlreadyClaimed);
        }

        let balance = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &(balance + FAUCET_AMOUNT));

        let supply: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(supply + FAUCET_AMOUNT));

        env.storage()
            .persistent()
            .set(&DataKey::FaucetClaimed(to.clone()), &true);

        env.events()
            .publish((symbol_short!("faucet"), to), FAUCET_AMOUNT);
        Ok(())
    }

    /// Whether an address has already claimed the faucet - lets the
    /// frontend check before attempting a claim, so it doesn't need
    /// to rely on catching an error to know.
    pub fn has_claimed_faucet(env: Env, id: Address) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::FaucetClaimed(id))
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    /// Standard peer-to-peer / contract-to-account transfer. Requires
    /// the `from` address to have authorized the invocation - when
    /// called cross-contract from transit-controller, this auth was
    /// already granted by the rider's transaction signature and
    /// Soroban's auth framework verifies it satisfies this exact
    /// sub-invocation (from, amount, contract).
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), TokenError> {
        if amount <= 0 {
            return Err(TokenError::NegativeAmount);
        }
        from.require_auth();
        Self::move_balance(&env, &from, &to, amount)?;
        env.events()
            .publish((symbol_short!("transfer"), from, to), amount);
        Ok(())
    }

    /// Burn tokens out of circulation entirely (e.g. a ticket redemption
    /// that doesn't route to an operator wallet, or reconciliation).
    pub fn burn(env: Env, from: Address, amount: i128) -> Result<(), TokenError> {
        if amount <= 0 {
            return Err(TokenError::NegativeAmount);
        }
        from.require_auth();
        let balance = Self::balance(env.clone(), from.clone());
        if balance < amount {
            return Err(TokenError::InsufficientBalance);
        }
        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(balance - amount));

        let supply: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(supply - amount));

        env.events().publish((symbol_short!("burn"), from), amount);
        Ok(())
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0)
    }

    fn move_balance(env: &Env, from: &Address, to: &Address, amount: i128) -> Result<(), TokenError> {
        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            return Err(TokenError::InsufficientBalance);
        }
        let to_balance = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(from_balance - amount));
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &(to_balance + amount));
        Ok(())
    }
}

#[cfg(test)]
mod test;