CREATE TABLE `tenant_operating_model_transitions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `from_model` ENUM('SERVICE_PRICING', 'MEMBERSHIP') NOT NULL,
  `to_model` ENUM('SERVICE_PRICING', 'MEMBERSHIP') NOT NULL,
  `effective_at` DATETIME(3) NOT NULL,
  `created_by_user_id` BIGINT UNSIGNED NOT NULL,
  `created_by_session_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_operating_model_transitions_public_id_key` (`public_id`),
  KEY `tenant_operating_model_transitions_tenant_id_effective_at_idx` (`tenant_id`, `effective_at`),
  KEY `tenant_operating_model_transitions_created_by_user_id_idx` (`created_by_user_id`),
  KEY `tenant_operating_model_transitions_created_by_session_id_idx` (`created_by_session_id`),
  CONSTRAINT `tenant_operating_model_transitions_tenant_fk`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `tenant_operating_model_transitions_user_fk`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `tenant_operating_model_transitions_session_fk`
    FOREIGN KEY (`created_by_session_id`) REFERENCES `user_sessions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
