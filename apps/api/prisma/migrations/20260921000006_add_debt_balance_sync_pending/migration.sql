ALTER TABLE `debts` ADD COLUMN `balance_sync_pending` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `debts_origin_type_balance_sync_pending_status_idx` ON `debts`(`origin_type`, `balance_sync_pending`, `status`);
