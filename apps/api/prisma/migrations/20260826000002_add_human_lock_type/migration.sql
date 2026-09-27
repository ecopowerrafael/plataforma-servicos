-- Add humanLockType to ProspectingLead
ALTER TABLE prospecting_leads
ADD COLUMN human_lock_type VARCHAR(50) NULL AFTER human_lock_reason;

-- Default existing locks to MANUAL (conservative, safe assumption)
UPDATE prospecting_leads
SET human_lock_type = 'MANUAL'
WHERE human_lock_until IS NOT NULL AND human_lock_type IS NULL;
