-- Combo Booking: Extend Appointments model to support both service and combo bookings
-- Database: MariaDB 11.8.8

-- Step 1: Make service_id nullable to support combo-only appointments
-- Drop existing FK first (name confirmed as appointments_service_fkey in production)
ALTER TABLE `appointments` DROP FOREIGN KEY `appointments_service_fkey`;

-- Alter column to allow NULL
ALTER TABLE `appointments` MODIFY `service_id` bigint unsigned NULL;

-- Re-add FK with same constraints
ALTER TABLE `appointments`
ADD CONSTRAINT `appointments_service_fkey`
FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 2: Add combo_id column and FK
ALTER TABLE `appointments`
ADD COLUMN `combo_id` bigint unsigned NULL AFTER `service_id`,
ADD KEY `appointments_combo_id_fkey` (`combo_id`),
ADD CONSTRAINT `appointments_combo_id_fkey`
FOREIGN KEY (`combo_id`) REFERENCES `combos` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 3: Add combo_name_snapshot (immutable copy of combo.name at booking time)
-- Prevents issues if combo.name is updated after booking
ALTER TABLE `appointments`
ADD COLUMN `combo_name_snapshot` varchar(120) NULL COLLATE utf8mb4_unicode_ci AFTER `combo_id`;

-- Step 4: Add XOR CHECK constraint ensuring exactly one of service_id or combo_id is NOT NULL
-- This prevents both being set or both being null
ALTER TABLE `appointments`
ADD CONSTRAINT `appointments_service_xor_combo_check`
CHECK ((`service_id` IS NOT NULL AND `combo_id` IS NULL) OR (`service_id` IS NULL AND `combo_id` IS NOT NULL));
