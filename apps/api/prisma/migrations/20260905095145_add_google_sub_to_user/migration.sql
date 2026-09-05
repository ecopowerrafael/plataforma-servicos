-- Add Google OAuth identifier to User
ALTER TABLE `users` ADD COLUMN `google_sub` VARCHAR(255) UNIQUE AFTER `password_hash`;
