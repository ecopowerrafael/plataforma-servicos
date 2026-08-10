CREATE TABLE `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `normalized_email` VARCHAR(254) NOT NULL,
  `password_hash` VARCHAR(255) NULL,
  `status` ENUM('ACTIVE', 'INVITED', 'SUSPENDED', 'INACTIVE') NOT NULL DEFAULT 'INVITED',
  `email_verified_at` DATETIME(3) NULL,
  `last_login_at` DATETIME(3) NULL,
  `password_changed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  CONSTRAINT `users_active_password_check`
    CHECK (`status` = 'INVITED' OR `password_hash` IS NOT NULL),
  UNIQUE INDEX `users_public_id_key` (`public_id`),
  UNIQUE INDEX `users_normalized_email_key` (`normalized_email`),
  INDEX `users_status_idx` (`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NULL,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `is_system` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  CONSTRAINT `roles_scope_check`
    CHECK ((`is_system` = true AND `tenant_id` IS NULL) OR (`is_system` = false AND `tenant_id` IS NOT NULL)),
  UNIQUE INDEX `roles_public_id_key` (`public_id`),
  UNIQUE INDEX `roles_code_key` (`code`),
  INDEX `roles_tenant_id_idx` (`tenant_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `permissions_code_key` (`code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `role_permissions` (
  `role_id` BIGINT UNSIGNED NOT NULL,
  `permission_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `role_permissions_permission_id_idx` (`permission_id`),
  PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tenant_memberships` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('ACTIVE', 'INVITED', 'SUSPENDED', 'INACTIVE') NOT NULL DEFAULT 'INVITED',
  `is_owner` BOOLEAN NOT NULL DEFAULT false,
  `joined_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `tenant_memberships_owner_active_check`
    CHECK (`is_owner` = false OR `status` = 'ACTIVE'),
  UNIQUE INDEX `tenant_memberships_public_id_key` (`public_id`),
  UNIQUE INDEX `tenant_memberships_tenant_id_user_id_key` (`tenant_id`, `user_id`),
  INDEX `tenant_memberships_user_id_status_idx` (`user_id`, `status`),
  INDEX `tenant_memberships_tenant_id_status_idx` (`tenant_id`, `status`),
  INDEX `tenant_memberships_role_id_idx` (`role_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `last_seen_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  `revocation_reason` VARCHAR(100) NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `user_sessions_public_id_key` (`public_id`),
  UNIQUE INDEX `user_sessions_token_hash_key` (`token_hash`),
  INDEX `user_sessions_user_id_revoked_at_expires_at_idx` (`user_id`, `revoked_at`, `expires_at`),
  INDEX `user_sessions_expires_at_idx` (`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `password_reset_tokens` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `requested_ip` VARCHAR(45) NULL,

  UNIQUE INDEX `password_reset_tokens_token_hash_key` (`token_hash`),
  INDEX `password_reset_tokens_user_id_used_at_expires_at_idx` (`user_id`, `used_at`, `expires_at`),
  INDEX `password_reset_tokens_expires_at_idx` (`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_invitations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `normalized_email` VARCHAR(254) NOT NULL,
  `role_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `status` ENUM('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
  `expires_at` DATETIME(3) NOT NULL,
  `accepted_at` DATETIME(3) NULL,
  `invited_by_user_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `user_invitations_public_id_key` (`public_id`),
  UNIQUE INDEX `user_invitations_token_hash_key` (`token_hash`),
  INDEX `user_invitations_tenant_id_status_expires_at_idx` (`tenant_id`, `status`, `expires_at`),
  INDEX `user_invitations_normalized_email_status_idx` (`normalized_email`, `status`),
  INDEX `user_invitations_role_id_idx` (`role_id`),
  INDEX `user_invitations_invited_by_user_id_idx` (`invited_by_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NULL,
  `user_id` BIGINT UNSIGNED NULL,
  `session_id` BIGINT UNSIGNED NULL,
  `action` VARCHAR(100) NOT NULL,
  `target_type` VARCHAR(80) NOT NULL,
  `target_public_id` CHAR(36) NULL,
  `metadata` JSON NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `audit_logs_public_id_key` (`public_id`),
  INDEX `audit_logs_tenant_id_created_at_idx` (`tenant_id`, `created_at`),
  INDEX `audit_logs_user_id_created_at_idx` (`user_id`, `created_at`),
  INDEX `audit_logs_action_created_at_idx` (`action`, `created_at`),
  INDEX `audit_logs_session_id_idx` (`session_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `roles` ADD CONSTRAINT `roles_tenant_id_fkey`
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey`
  FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey`
  FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `tenant_memberships` ADD CONSTRAINT `tenant_memberships_tenant_id_fkey`
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `tenant_memberships` ADD CONSTRAINT `tenant_memberships_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `tenant_memberships` ADD CONSTRAINT `tenant_memberships_role_id_fkey`
  FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `user_invitations` ADD CONSTRAINT `user_invitations_tenant_id_fkey`
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `user_invitations` ADD CONSTRAINT `user_invitations_role_id_fkey`
  FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `user_invitations` ADD CONSTRAINT `user_invitations_invited_by_user_id_fkey`
  FOREIGN KEY (`invited_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_tenant_id_fkey`
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_session_id_fkey`
  FOREIGN KEY (`session_id`) REFERENCES `user_sessions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
