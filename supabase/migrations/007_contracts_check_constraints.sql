-- Add CHECK constraints to contracts table (matching employees table pattern)

-- 1. contract_type must be one of the valid types
ALTER TABLE contracts
ADD CONSTRAINT contracts_contract_type_check
CHECK (contract_type IN ('contract', 'subscription', 'software'));

-- 2. billing_cycle must be one of the valid values
ALTER TABLE contracts
ADD CONSTRAINT contracts_billing_cycle_check
CHECK (billing_cycle IS NULL OR billing_cycle IN ('one_off', 'monthly', 'annual'));

-- 3. At least one of expiry_date or renewal_date must be set
ALTER TABLE contracts
ADD CONSTRAINT contracts_date_required_check
CHECK (expiry_date IS NOT NULL OR renewal_date IS NOT NULL);
