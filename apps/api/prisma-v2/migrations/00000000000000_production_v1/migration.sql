
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `appointment_history_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointment_history_entries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `appointment_id` bigint unsigned NOT NULL,
  `action` enum('CREATED','STATUS_CHANGED','RESCHEDULED','CHECKED_IN') COLLATE utf8mb4_unicode_ci NOT NULL,
  `previous_status` enum('PENDING','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELED','NO_SHOW') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_status` enum('PENDING','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELED','NO_SHOW') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `previous_starts_at` datetime(3) DEFAULT NULL,
  `new_starts_at` datetime(3) DEFAULT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_fit_in` tinyint(1) NOT NULL DEFAULT '0',
  `user_id` bigint unsigned DEFAULT NULL,
  `session_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `appointment_history_entries_public_id_key` (`public_id`),
  KEY `appointment_history_entries_tenant_id_appointment_id_created_idx` (`tenant_id`,`appointment_id`,`created_at`),
  KEY `appointment_history_entries_appointment_id_fkey` (`appointment_id`),
  KEY `appointment_history_entries_user_id_fkey` (`user_id`),
  KEY `appointment_history_entries_session_id_fkey` (`session_id`),
  CONSTRAINT `appointment_history_entries_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointment_history_entries_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `user_sessions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointment_history_entries_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointment_history_entries_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `appointment_reminder_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointment_reminder_configs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `day_before_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `day_before_days_before` smallint unsigned NOT NULL DEFAULT '1',
  `day_before_hour` smallint unsigned NOT NULL DEFAULT '9',
  `day_before_minute` smallint unsigned NOT NULL DEFAULT '0',
  `upcoming_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `upcoming_minutes_before` smallint unsigned NOT NULL DEFAULT '60',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `appointment_reminder_configs_tenant_id_key` (`tenant_id`),
  CONSTRAINT `appointment_reminder_configs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `appointment_reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointment_reviews` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `appointment_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `professional_id` bigint unsigned NOT NULL,
  `service_id` bigint unsigned NOT NULL,
  `rating` tinyint unsigned NOT NULL,
  `comment` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `appointment_reviews_public_id_key` (`public_id`),
  UNIQUE KEY `appointment_reviews_appointment_id_key` (`appointment_id`),
  KEY `appointment_reviews_tenant_id_customer_id_idx` (`tenant_id`,`customer_id`),
  KEY `appointment_reviews_tenant_id_professional_id_idx` (`tenant_id`,`professional_id`),
  KEY `appointment_reviews_customer_id_fkey` (`customer_id`),
  KEY `appointment_reviews_professional_id_fkey` (`professional_id`),
  KEY `appointment_reviews_service_id_fkey` (`service_id`),
  CONSTRAINT `appointment_reviews_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointment_reviews_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointment_reviews_professional_id_fkey` FOREIGN KEY (`professional_id`) REFERENCES `professionals` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointment_reviews_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointment_reviews_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `appointment_waitlist_opportunities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointment_waitlist_opportunities` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `released_appointment_id` bigint unsigned NOT NULL,
  `professional_id` bigint unsigned NOT NULL,
  `service_id` bigint unsigned NOT NULL,
  `unit_id` bigint unsigned NOT NULL,
  `starts_at` datetime(3) NOT NULL,
  `claimed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `appointment_waitlist_opportunities_public_id_key` (`public_id`),
  UNIQUE KEY `appointment_waitlist_opportunities_released_appointment_id_key` (`released_appointment_id`),
  KEY `appointment_waitlist_opportunities_tenant_id_service_id_unit_idx` (`tenant_id`,`service_id`,`unit_id`,`starts_at`,`claimed_at`),
  KEY `appointment_waitlist_opportunities_professional_id_fkey` (`professional_id`),
  KEY `appointment_waitlist_opportunities_service_id_fkey` (`service_id`),
  KEY `appointment_waitlist_opportunities_unit_id_fkey` (`unit_id`),
  CONSTRAINT `appointment_waitlist_opportunities_professional_id_fkey` FOREIGN KEY (`professional_id`) REFERENCES `professionals` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointment_waitlist_opportunities_released_appointment_id_fkey` FOREIGN KEY (`released_appointment_id`) REFERENCES `appointments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointment_waitlist_opportunities_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointment_waitlist_opportunities_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointment_waitlist_opportunities_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `business_units` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `appointment_waitlists`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointment_waitlists` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `professional_id` bigint unsigned DEFAULT NULL,
  `service_id` bigint unsigned NOT NULL,
  `unit_id` bigint unsigned NOT NULL,
  `preferred_date_from` date NOT NULL,
  `preferred_date_to` date NOT NULL,
  `preferred_time_start` char(5) COLLATE utf8mb4_unicode_ci NOT NULL,
  `preferred_time_end` char(5) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `notes` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('WAITING','MATCHED','CONVERTED','EXPIRED','CANCELED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'WAITING',
  `matched_at` datetime(3) DEFAULT NULL,
  `converted_at` datetime(3) DEFAULT NULL,
  `canceled_at` datetime(3) DEFAULT NULL,
  `canceled_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `appointment_id` bigint unsigned DEFAULT NULL,
  `opportunity_id` bigint unsigned DEFAULT NULL,
  `active_identity` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `appointment_waitlists_public_id_key` (`public_id`),
  UNIQUE KEY `appointment_waitlists_appointment_id_key` (`appointment_id`),
  UNIQUE KEY `appointment_waitlists_opportunity_id_key` (`opportunity_id`),
  UNIQUE KEY `appointment_waitlists_active_identity_key` (`active_identity`),
  KEY `appointment_waitlists_tenant_id_status_expires_at_created_at_idx` (`tenant_id`,`status`,`expires_at`,`created_at`),
  KEY `appointment_waitlists_tenant_id_professional_id_service_id_u_idx` (`tenant_id`,`professional_id`,`service_id`,`unit_id`),
  KEY `appointment_waitlists_customer_id_fkey` (`customer_id`),
  KEY `appointment_waitlists_professional_id_fkey` (`professional_id`),
  KEY `appointment_waitlists_service_id_fkey` (`service_id`),
  KEY `appointment_waitlists_unit_id_fkey` (`unit_id`),
  CONSTRAINT `appointment_waitlists_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointment_waitlists_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `appointment_waitlists_opportunity_id_fkey` FOREIGN KEY (`opportunity_id`) REFERENCES `appointment_waitlist_opportunities` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointment_waitlists_professional_id_fkey` FOREIGN KEY (`professional_id`) REFERENCES `professionals` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointment_waitlists_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `appointment_waitlists_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `appointment_waitlists_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `business_units` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `appointments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `protocol` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `professional_id` bigint unsigned NOT NULL,
  `service_id` bigint unsigned DEFAULT NULL,
  `combo_id` bigint unsigned DEFAULT NULL,
  `combo_name_snapshot` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_id` bigint unsigned DEFAULT NULL,
  `starts_at` datetime(3) NOT NULL,
  `ends_at` datetime(3) NOT NULL,
  `duration_minutes` smallint unsigned NOT NULL,
  `post_service_break_minutes` smallint unsigned NOT NULL DEFAULT '0',
  `price_cents` bigint unsigned NOT NULL,
  `charge_source` enum('SERVICE_PRICE','MEMBERSHIP_INCLUDED','MEMBERSHIP_DISCOUNT') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_price_cents` bigint unsigned DEFAULT NULL,
  `amount_due_cents` bigint unsigned DEFAULT NULL,
  `status` enum('PENDING','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELED','NO_SHOW') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `notes` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'INTERNAL',
  `canceled_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reschedule_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kind` enum('STANDARD','EVALUATION','TREATMENT_SESSION') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'STANDARD',
  `treatment_plan_id` bigint unsigned DEFAULT NULL,
  `session_number` smallint unsigned DEFAULT NULL,
  `is_fit_in` tinyint(1) NOT NULL DEFAULT '0',
  `fit_in_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `checked_in_at` datetime(3) DEFAULT NULL,
  `deposit_type` enum('FIXED','PERCENTAGE') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deposit_percentage` tinyint unsigned DEFAULT NULL,
  `deposit_amount_cents` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `appointments_public_id_key` (`public_id`),
  UNIQUE KEY `appointments_tenant_id_protocol_key` (`tenant_id`,`protocol`),
  KEY `appointments_tenant_id_treatment_plan_id_session_number_idx` (`tenant_id`,`treatment_plan_id`,`session_number`),
  KEY `appointments_tenant_id_professional_id_starts_at_ends_at_sta_idx` (`tenant_id`,`professional_id`,`starts_at`,`ends_at`,`status`),
  KEY `appointments_tenant_id_customer_id_starts_at_idx` (`tenant_id`,`customer_id`,`starts_at`),
  KEY `appointments_customer_id_fkey` (`customer_id`),
  KEY `appointments_professional_id_fkey` (`professional_id`),
  KEY `appointments_service_id_fkey` (`service_id`),
  KEY `appointments_combo_id_fkey` (`combo_id`),
  KEY `appointments_unit_id_fkey` (`unit_id`),
  KEY `appointments_treatment_plan_id_fkey` (`treatment_plan_id`),
  CONSTRAINT `appointments_combo_id_fkey` FOREIGN KEY (`combo_id`) REFERENCES `combos` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointments_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointments_professional_id_fkey` FOREIGN KEY (`professional_id`) REFERENCES `professionals` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointments_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointments_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `appointments_treatment_plan_id_fkey` FOREIGN KEY (`treatment_plan_id`) REFERENCES `treatment_plans` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `appointments_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `business_units` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned DEFAULT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `session_id` bigint unsigned DEFAULT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_type` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_public_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `audit_logs_public_id_key` (`public_id`),
  KEY `audit_logs_tenant_id_created_at_idx` (`tenant_id`,`created_at`),
  KEY `audit_logs_user_id_created_at_idx` (`user_id`,`created_at`),
  KEY `audit_logs_action_created_at_idx` (`action`,`created_at`),
  KEY `audit_logs_session_id_idx` (`session_id`),
  CONSTRAINT `audit_logs_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `user_sessions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `audit_logs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `automation_executions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `automation_executions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `automation_id` bigint unsigned NOT NULL,
  `target_type` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('SENT','SKIPPED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `error` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `automation_executions_public_id_key` (`public_id`),
  UNIQUE KEY `automation_executions_automation_target_key` (`automation_id`,`target_type`,`target_public_id`),
  KEY `automation_executions_tenant_id_created_at_idx` (`tenant_id`,`created_at`),
  CONSTRAINT `automation_executions_automation_id_fkey` FOREIGN KEY (`automation_id`) REFERENCES `tenant_automations` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `automation_executions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `business_unit_date_overrides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `business_unit_date_overrides` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `unit_id` bigint unsigned NOT NULL,
  `date` date NOT NULL,
  `type` enum('EXCEPTION','HOLIDAY') COLLATE utf8mb4_unicode_ci NOT NULL,
  `closed` tinyint(1) NOT NULL DEFAULT '0',
  `starts_at` char(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ends_at` char(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `business_unit_date_overrides_public_id_key` (`public_id`),
  KEY `business_unit_date_overrides_tenant_id_unit_id_date_active_idx` (`tenant_id`,`unit_id`,`date`,`active`),
  KEY `business_unit_date_overrides_tenant_id_unit_id_type_date_idx` (`tenant_id`,`unit_id`,`type`,`date`),
  KEY `business_unit_date_overrides_unit_id_fkey` (`unit_id`),
  CONSTRAINT `business_unit_date_overrides_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `business_unit_date_overrides_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `business_units` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `business_unit_operating_hours`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `business_unit_operating_hours` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `unit_id` bigint unsigned NOT NULL,
  `weekday` tinyint unsigned NOT NULL,
  `starts_at` char(5) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ends_at` char(5) COLLATE utf8mb4_unicode_ci NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `business_unit_operating_hours_public_id_key` (`public_id`),
  KEY `business_unit_operating_hours_tenant_id_unit_id_weekday_acti_idx` (`tenant_id`,`unit_id`,`weekday`,`active`),
  KEY `business_unit_operating_hours_unit_id_fkey` (`unit_id`),
  CONSTRAINT `business_unit_operating_hours_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `business_unit_operating_hours_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `business_units` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `business_units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `business_units` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(63) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `is_headquarters` tinyint(1) NOT NULL DEFAULT '0',
  `timezone` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `postal_code` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `street` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `complement` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `district` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country_code` char(2) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `latitude` double DEFAULT NULL,
  `longitude` double DEFAULT NULL,
  `google_maps_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `business_units_public_id_key` (`public_id`),
  UNIQUE KEY `business_units_tenant_id_slug_key` (`tenant_id`,`slug`),
  KEY `business_units_tenant_id_status_idx` (`tenant_id`,`status`),
  CONSTRAINT `business_units_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cash_movements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cash_movements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `cash_register_id` bigint unsigned NOT NULL,
  `type` enum('MANUAL','PAYMENT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `direction` enum('IN','OUT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount_cents` bigint unsigned NOT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_id` bigint unsigned DEFAULT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `session_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cash_movements_public_id_key` (`public_id`),
  UNIQUE KEY `cash_movements_payment_id_key` (`payment_id`),
  KEY `cash_movements_tenant_id_cash_register_id_created_at_idx` (`tenant_id`,`cash_register_id`,`created_at`),
  KEY `cash_movements_cash_register_id_fkey` (`cash_register_id`),
  KEY `cash_movements_user_id_fkey` (`user_id`),
  KEY `cash_movements_session_id_fkey` (`session_id`),
  CONSTRAINT `cash_movements_cash_register_id_fkey` FOREIGN KEY (`cash_register_id`) REFERENCES `cash_registers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cash_movements_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cash_movements_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `user_sessions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cash_movements_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cash_movements_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cash_registers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cash_registers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `unit_id` bigint unsigned DEFAULT NULL,
  `status` enum('OPEN','CLOSED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `opening_balance_cents` bigint unsigned NOT NULL,
  `closing_balance_cents` bigint unsigned DEFAULT NULL,
  `opened_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `closed_at` datetime(3) DEFAULT NULL,
  `opened_by_user_id` bigint unsigned DEFAULT NULL,
  `opened_by_session_id` bigint unsigned DEFAULT NULL,
  `closed_by_user_id` bigint unsigned DEFAULT NULL,
  `closed_by_session_id` bigint unsigned DEFAULT NULL,
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cash_registers_public_id_key` (`public_id`),
  KEY `cash_registers_tenant_id_unit_id_status_idx` (`tenant_id`,`unit_id`,`status`),
  KEY `cash_registers_unit_id_fkey` (`unit_id`),
  KEY `cash_registers_opened_by_user_id_fkey` (`opened_by_user_id`),
  KEY `cash_registers_opened_by_session_id_fkey` (`opened_by_session_id`),
  KEY `cash_registers_closed_by_user_id_fkey` (`closed_by_user_id`),
  KEY `cash_registers_closed_by_session_id_fkey` (`closed_by_session_id`),
  CONSTRAINT `cash_registers_closed_by_session_id_fkey` FOREIGN KEY (`closed_by_session_id`) REFERENCES `user_sessions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cash_registers_closed_by_user_id_fkey` FOREIGN KEY (`closed_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cash_registers_opened_by_session_id_fkey` FOREIGN KEY (`opened_by_session_id`) REFERENCES `user_sessions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cash_registers_opened_by_user_id_fkey` FOREIGN KEY (`opened_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cash_registers_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cash_registers_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `business_units` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `collection_attempts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `collection_attempts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `debt_id` bigint unsigned NOT NULL,
  `cycle_number` smallint unsigned NOT NULL,
  `attempt_number` smallint unsigned NOT NULL,
  `attempt_type` enum('INITIAL_COLLECTION','SAME_DAY_FOLLOWUP','NEXT_DAY_FOLLOWUP','CYCLE_RESTART','PROMISE_DUE','PROMISE_OVERDUE','PIX_PENDING_REMINDER','PARTIAL_PAYMENT_FOLLOWUP') COLLATE utf8mb4_unicode_ci NOT NULL,
  `scheduled_at` datetime(3) NOT NULL,
  `status` enum('SCHEDULED','PROCESSING','SENT','SKIPPED','FAILED','RESPONDED','CANCELED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SCHEDULED',
  `template_key` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notification_log_id` bigint unsigned DEFAULT NULL,
  `sent_at` datetime(3) DEFAULT NULL,
  `responded_at` datetime(3) DEFAULT NULL,
  `skipped_at` datetime(3) DEFAULT NULL,
  `skip_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `processing_at` datetime(3) DEFAULT NULL,
  `provider_message_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `technical_retry_count` tinyint unsigned NOT NULL DEFAULT '0',
  `next_retry_at` datetime(3) DEFAULT NULL,
  `last_error` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `collection_attempts_public_id_key` (`public_id`),
  UNIQUE KEY `udca_debt_cycle_attempt` (`debt_id`,`cycle_number`,`attempt_number`),
  KEY `collection_attempts_tenant_id_status_scheduled_at_idx` (`tenant_id`,`status`,`scheduled_at`),
  KEY `collection_attempts_notification_log_id_fkey` (`notification_log_id`),
  CONSTRAINT `collection_attempts_debt_id_fkey` FOREIGN KEY (`debt_id`) REFERENCES `debts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `collection_attempts_notification_log_id_fkey` FOREIGN KEY (`notification_log_id`) REFERENCES `notification_logs` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `collection_attempts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `collection_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `collection_rules` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `cadence_type` enum('WEEKLY','BIWEEKLY','MONTHLY','CUSTOM_DAYS') COLLATE utf8mb4_unicode_ci NOT NULL,
  `cadence_days` smallint unsigned DEFAULT NULL,
  `preferred_weekday` tinyint unsigned DEFAULT NULL,
  `monthly_day` tinyint unsigned DEFAULT NULL,
  `allowed_start_hour` tinyint unsigned NOT NULL DEFAULT '9',
  `allowed_end_hour` tinyint unsigned NOT NULL DEFAULT '18',
  `max_attempts_per_day` tinyint unsigned NOT NULL DEFAULT '1',
  `consecutive_days` tinyint unsigned NOT NULL DEFAULT '3',
  `pause_days_after_cycle` tinyint unsigned NOT NULL DEFAULT '4',
  `max_cycles` tinyint unsigned DEFAULT NULL,
  `min_minutes_between_attempts` smallint unsigned NOT NULL DEFAULT '120',
  `skip_sundays` tinyint(1) NOT NULL DEFAULT '1',
  `partial_payment_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `partial_offer_percentages` json NOT NULL,
  `partial_minimum_cents` bigint unsigned NOT NULL DEFAULT '0',
  `partial_rounding_step_cents` bigint unsigned NOT NULL DEFAULT '1',
  `ask_promise_after_partial_payment` tinyint(1) NOT NULL DEFAULT '1',
  `promise_quick_options_days` json NOT NULL,
  `no_response_followup_next_day` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `collection_rules_public_id_key` (`public_id`),
  KEY `collection_rules_tenant_id_active_idx` (`tenant_id`,`active`),
  CONSTRAINT `collection_rules_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `combo_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `combo_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `combo_id` bigint unsigned NOT NULL,
  `service_id` bigint unsigned NOT NULL,
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `combo_items_public_id_key` (`public_id`),
  UNIQUE KEY `combo_items_combo_id_service_id_key` (`combo_id`,`service_id`),
  KEY `combo_items_tenant_id_combo_id_sort_order_idx` (`tenant_id`,`combo_id`,`sort_order`),
  KEY `combo_items_tenant_id_service_id_idx` (`tenant_id`,`service_id`),
  KEY `combo_items_service_id_fkey` (`service_id`),
  CONSTRAINT `combo_items_combo_id_fkey` FOREIGN KEY (`combo_id`) REFERENCES `combos` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `combo_items_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `combo_items_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `combos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `combos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_path` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_alt` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `price_cents` bigint unsigned NOT NULL DEFAULT '0',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `combos_public_id_key` (`public_id`),
  UNIQUE KEY `combos_tenant_id_name_key` (`tenant_id`,`name`),
  KEY `combos_tenant_id_active_sort_order_idx` (`tenant_id`,`active`,`sort_order`),
  CONSTRAINT `combos_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `commercial_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commercial_accounts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `display_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('MANAGER','REPRESENTATIVE','SELLER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_id` bigint unsigned DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `default_commission_bps` int NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  `created_by_user_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `commercial_accounts_public_id_key` (`public_id`),
  KEY `commercial_accounts_user_id_idx` (`user_id`),
  KEY `commercial_accounts_parent_id_idx` (`parent_id`),
  KEY `commercial_accounts_created_by_user_id_idx` (`created_by_user_id`),
  KEY `commercial_accounts_role_idx` (`role`),
  CONSTRAINT `commercial_accounts_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commercial_accounts_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `commercial_accounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `commercial_accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=51 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `commercial_commission_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commercial_commission_rules` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `commercial_account_id` bigint unsigned NOT NULL,
  `plan_id` bigint unsigned DEFAULT NULL,
  `percentage_bps` smallint unsigned NOT NULL,
  `effective_from` datetime(3) NOT NULL,
  `effective_until` datetime(3) DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `commercial_commission_rules_public_id_key` (`public_id`),
  UNIQUE KEY `uccr_account_plan_date` (`commercial_account_id`,`plan_id`,`effective_from`),
  KEY `commercial_commission_rules_commercial_account_id_active_idx` (`commercial_account_id`,`active`),
  KEY `commercial_commission_rules_plan_id_idx` (`plan_id`),
  CONSTRAINT `commercial_commission_rules_commercial_account_id_fkey` FOREIGN KEY (`commercial_account_id`) REFERENCES `commercial_accounts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commercial_commission_rules_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `commercial_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `commercial_commissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commercial_commissions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `commercial_account_id` bigint unsigned NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `subscription_id` bigint unsigned NOT NULL,
  `base_amount_cents` bigint unsigned NOT NULL,
  `percentage_bps_snapshot` smallint unsigned NOT NULL,
  `commission_amount_cents` bigint unsigned NOT NULL,
  `role_snapshot` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','AVAILABLE','REVERSED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `payment_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_source` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reversed_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `commercial_commissions_public_id_key` (`public_id`),
  UNIQUE KEY `ucc_account_subscription_date` (`commercial_account_id`,`subscription_id`,`created_at`),
  KEY `commercial_commissions_commercial_account_id_status_idx` (`commercial_account_id`,`status`),
  KEY `commercial_commissions_tenant_id_idx` (`tenant_id`),
  KEY `commercial_commissions_subscription_id_idx` (`subscription_id`),
  KEY `commercial_commissions_payment_id_idx` (`payment_id`),
  KEY `commercial_commissions_created_at_idx` (`created_at`),
  CONSTRAINT `commercial_commissions_commercial_account_id_fkey` FOREIGN KEY (`commercial_account_id`) REFERENCES `commercial_accounts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commercial_commissions_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commercial_commissions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `commercial_manual_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commercial_manual_payments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `subscription_id` bigint unsigned NOT NULL,
  `manager_account_id` bigint unsigned NOT NULL,
  `amount_cents` bigint unsigned NOT NULL,
  `idempotency_key` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` char(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PROCESSED',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processed_at` datetime(3) DEFAULT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'BRL',
  `payment_method` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CASH',
  `receiver_type` enum('REPRESENTATIVE','ADMINISTRATOR') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'REPRESENTATIVE',
  `received_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reversal_of_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `commercial_manual_payments_public_id_key` (`public_id`),
  UNIQUE KEY `ucmp_idempotency_key` (`idempotency_key`),
  KEY `commercial_manual_payments_tenant_id_idx` (`tenant_id`),
  KEY `commercial_manual_payments_subscription_id_idx` (`subscription_id`),
  KEY `commercial_manual_payments_manager_account_id_idx` (`manager_account_id`),
  KEY `commercial_manual_payments_created_at_idx` (`created_at`),
  KEY `commercial_manual_payments_reversal_of_id_idx` (`reversal_of_id`),
  CONSTRAINT `commercial_manual_payments_manager_account_id_fkey` FOREIGN KEY (`manager_account_id`) REFERENCES `commercial_accounts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commercial_manual_payments_reversal_of_id_fk` FOREIGN KEY (`reversal_of_id`) REFERENCES `commercial_manual_payments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `commercial_manual_payments_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commercial_manual_payments_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `commercial_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commercial_plans` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subtitle` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `short_description` varchar(240) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','ARCHIVED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `billing_cycle` enum('MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL','CUSTOM') COLLATE utf8mb4_unicode_ci NOT NULL,
  `price_cents` bigint unsigned NOT NULL,
  `monthly_price_cents` bigint unsigned DEFAULT NULL,
  `annual_price_cents` bigint unsigned DEFAULT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `trial_days` smallint unsigned DEFAULT NULL,
  `is_public` tinyint(1) NOT NULL DEFAULT '0',
  `highlighted` tinyint(1) NOT NULL DEFAULT '0',
  `badge` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cta_text` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `commercial_plans_public_id_key` (`public_id`),
  UNIQUE KEY `commercial_plans_code_key` (`code`),
  KEY `commercial_plans_status_sort_order_idx` (`status`,`sort_order`),
  KEY `commercial_plans_billing_cycle_idx` (`billing_cycle`)
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `commercial_region_cities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commercial_region_cities` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `region_id` bigint unsigned NOT NULL,
  `ibge_code` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `state` char(2) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `commercial_region_cities_ibge_code_key` (`ibge_code`),
  KEY `commercial_region_cities_region_id_idx` (`region_id`),
  KEY `commercial_region_cities_ibge_code_idx` (`ibge_code`),
  CONSTRAINT `commercial_region_cities_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `commercial_regions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `commercial_regions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commercial_regions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `manager_id` bigint unsigned NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `commercial_regions_public_id_key` (`public_id`),
  KEY `commercial_regions_manager_id_idx` (`manager_id`),
  KEY `commercial_regions_active_idx` (`active`),
  CONSTRAINT `commercial_regions_manager_id_fkey` FOREIGN KEY (`manager_id`) REFERENCES `commercial_accounts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `commercial_remittance_allocations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commercial_remittance_allocations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `remittance_id` bigint unsigned NOT NULL,
  `manual_payment_id` bigint unsigned NOT NULL,
  `amount_cents` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `commercial_remittance_allocations_pair_key` (`remittance_id`,`manual_payment_id`),
  KEY `commercial_remittance_allocations_payment_idx` (`manual_payment_id`),
  CONSTRAINT `commercial_remittance_allocations_payment_fk` FOREIGN KEY (`manual_payment_id`) REFERENCES `commercial_manual_payments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commercial_remittance_allocations_remittance_fk` FOREIGN KEY (`remittance_id`) REFERENCES `commercial_remittances` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `commercial_remittances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commercial_remittances` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `commercial_account_id` bigint unsigned NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `amount_cents` bigint unsigned NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'BRL',
  `payment_method` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `proof_reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('PENDING','CONFIRMED','CANCELED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `confirmed_by_user_id` bigint unsigned DEFAULT NULL,
  `confirmed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `commercial_remittances_public_id_key` (`public_id`),
  KEY `commercial_remittances_account_status_created_idx` (`commercial_account_id`,`status`,`created_at`),
  KEY `commercial_remittances_tenant_status_created_idx` (`tenant_id`,`status`,`created_at`),
  KEY `commercial_remittances_user_fk` (`confirmed_by_user_id`),
  CONSTRAINT `commercial_remittances_account_fk` FOREIGN KEY (`commercial_account_id`) REFERENCES `commercial_accounts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commercial_remittances_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commercial_remittances_user_fk` FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `commercial_wallet_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commercial_wallet_entries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `commercial_account_id` bigint unsigned NOT NULL,
  `type` enum('COMMISSION_CREDIT','PLAN_PAYMENT_DEBIT','ADJUSTMENT_CREDIT','ADJUSTMENT_DEBIT','REVERSAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount_cents` bigint NOT NULL,
  `tenant_id` bigint unsigned DEFAULT NULL,
  `subscription_id` bigint unsigned DEFAULT NULL,
  `commission_id` bigint unsigned DEFAULT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `metadata` json DEFAULT NULL,
  `created_by_user_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `remittance_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `commercial_wallet_entries_public_id_key` (`public_id`),
  KEY `commercial_wallet_entries_commercial_account_id_created_at_idx` (`commercial_account_id`,`created_at`),
  KEY `commercial_wallet_entries_type_created_at_idx` (`type`,`created_at`),
  KEY `commercial_wallet_entries_tenant_id_idx` (`tenant_id`),
  KEY `commercial_wallet_entries_subscription_id_idx` (`subscription_id`),
  KEY `commercial_wallet_entries_commission_id_idx` (`commission_id`),
  KEY `commercial_wallet_entries_created_by_user_id_fkey` (`created_by_user_id`),
  KEY `commercial_wallet_entries_remittance_id_idx` (`remittance_id`),
  CONSTRAINT `commercial_wallet_entries_commercial_account_id_fkey` FOREIGN KEY (`commercial_account_id`) REFERENCES `commercial_accounts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commercial_wallet_entries_commission_id_fkey` FOREIGN KEY (`commission_id`) REFERENCES `commercial_commissions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `commercial_wallet_entries_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `commercial_wallet_entries_remittance_id_fk` FOREIGN KEY (`remittance_id`) REFERENCES `commercial_remittances` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `commercial_wallet_entries_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `commercial_wallet_entries_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=77 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `coupon_redemptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coupon_redemptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `coupon_id` bigint unsigned NOT NULL,
  `appointment_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `discount_amount_cents` bigint unsigned NOT NULL,
  `canceled_at` datetime(3) DEFAULT NULL,
  `canceled_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `coupon_redemptions_public_id_key` (`public_id`),
  UNIQUE KEY `coupon_redemptions_coupon_id_appointment_id_key` (`coupon_id`,`appointment_id`),
  KEY `coupon_redemptions_tenant_id_coupon_id_customer_id_idx` (`tenant_id`,`coupon_id`,`customer_id`),
  KEY `coupon_redemptions_tenant_id_appointment_id_idx` (`tenant_id`,`appointment_id`),
  KEY `coupon_redemptions_appointment_id_fkey` (`appointment_id`),
  KEY `coupon_redemptions_customer_id_fkey` (`customer_id`),
  CONSTRAINT `coupon_redemptions_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `coupon_redemptions_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `coupon_redemptions_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `coupon_redemptions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `coupons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coupons` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `discount_type` enum('FIXED','PERCENTAGE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `discount_value` int unsigned NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `valid_from` datetime(3) DEFAULT NULL,
  `valid_until` datetime(3) DEFAULT NULL,
  `max_uses` int unsigned DEFAULT NULL,
  `max_uses_per_customer` int unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `coupons_public_id_key` (`public_id`),
  UNIQUE KEY `coupons_tenant_id_code_key` (`tenant_id`,`code`),
  KEY `coupons_tenant_id_active_idx` (`tenant_id`,`active`),
  CONSTRAINT `coupons_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_favorites`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_favorites` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `professional_id` bigint unsigned DEFAULT NULL,
  `service_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_favorites_public_id_key` (`public_id`),
  UNIQUE KEY `customer_favorites_customer_id_professional_id_key` (`customer_id`,`professional_id`),
  UNIQUE KEY `customer_favorites_customer_id_service_id_key` (`customer_id`,`service_id`),
  KEY `customer_favorites_tenant_id_customer_id_idx` (`tenant_id`,`customer_id`),
  KEY `customer_favorites_professional_id_fkey` (`professional_id`),
  KEY `customer_favorites_service_id_fkey` (`service_id`),
  CONSTRAINT `customer_favorites_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_favorites_professional_id_fkey` FOREIGN KEY (`professional_id`) REFERENCES `professionals` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_favorites_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_favorites_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_membership_charges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_membership_charges` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `membership_id` bigint unsigned NOT NULL,
  `period_start` datetime(3) NOT NULL,
  `period_end` datetime(3) NOT NULL,
  `amount_cents` bigint unsigned NOT NULL,
  `status` enum('PENDING','PAID','FAILED','CANCELED','REFUNDED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `due_at` datetime(3) NOT NULL,
  `paid_at` datetime(3) DEFAULT NULL,
  `plan_snapshot` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_membership_charges_public_id_key` (`public_id`),
  UNIQUE KEY `customer_membership_charges_membership_id_period_start_key` (`membership_id`,`period_start`),
  KEY `customer_membership_charges_tenant_id_status_due_at_idx` (`tenant_id`,`status`,`due_at`),
  KEY `customer_membership_charges_tenant_id_membership_id_created__idx` (`tenant_id`,`membership_id`,`created_at`),
  CONSTRAINT `customer_membership_charges_membership_id_fkey` FOREIGN KEY (`membership_id`) REFERENCES `customer_memberships` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_membership_charges_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_membership_plan_benefits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_membership_plan_benefits` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_id` bigint unsigned NOT NULL,
  `service_id` bigint unsigned NOT NULL,
  `type` enum('QUANTITY','UNLIMITED','DISCOUNT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity_per_cycle` int unsigned DEFAULT NULL,
  `discount_percent` smallint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_membership_plan_benefits_public_id_key` (`public_id`),
  UNIQUE KEY `customer_membership_plan_benefits_plan_id_service_id_key` (`plan_id`,`service_id`),
  KEY `customer_membership_plan_benefits_service_id_idx` (`service_id`),
  CONSTRAINT `customer_membership_plan_benefits_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `customer_membership_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `customer_membership_plan_benefits_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_membership_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_membership_plans` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `price_cents` bigint unsigned NOT NULL,
  `billing_interval` enum('MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_membership_plans_public_id_key` (`public_id`),
  KEY `customer_membership_plans_tenant_id_active_sort_order_idx` (`tenant_id`,`active`,`sort_order`),
  CONSTRAINT `customer_membership_plans_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_membership_usages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_membership_usages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `membership_id` bigint unsigned NOT NULL,
  `membership_charge_id` bigint unsigned NOT NULL,
  `appointment_id` bigint unsigned DEFAULT NULL,
  `service_id` bigint unsigned NOT NULL,
  `quantity` int unsigned NOT NULL,
  `status` enum('RESERVED','CONSUMED','RELEASED','REVERSED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_membership_usages_public_id_key` (`public_id`),
  UNIQUE KEY `customer_membership_usages_appointment_id_service_id_members_key` (`appointment_id`,`service_id`,`membership_charge_id`),
  KEY `customer_membership_usages_tenant_id_membership_id_status_idx` (`tenant_id`,`membership_id`,`status`),
  KEY `customer_membership_usages_membership_charge_id_idx` (`membership_charge_id`),
  KEY `customer_membership_usages_appointment_id_idx` (`appointment_id`),
  KEY `customer_membership_usages_membership_id_fkey` (`membership_id`),
  KEY `customer_membership_usages_service_id_fkey` (`service_id`),
  CONSTRAINT `customer_membership_usages_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `customer_membership_usages_membership_charge_id_fkey` FOREIGN KEY (`membership_charge_id`) REFERENCES `customer_membership_charges` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_membership_usages_membership_id_fkey` FOREIGN KEY (`membership_id`) REFERENCES `customer_memberships` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_membership_usages_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_membership_usages_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_memberships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_memberships` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `plan_id` bigint unsigned NOT NULL,
  `status` enum('PENDING','ACTIVE','PAST_DUE','PAUSED','CANCELED','EXPIRED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `active_key` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `started_at` datetime(3) DEFAULT NULL,
  `current_period_start` datetime(3) DEFAULT NULL,
  `current_period_end` datetime(3) DEFAULT NULL,
  `next_billing_at` datetime(3) DEFAULT NULL,
  `paused_at` datetime(3) DEFAULT NULL,
  `canceled_at` datetime(3) DEFAULT NULL,
  `cancel_at_period_end` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_memberships_public_id_key` (`public_id`),
  UNIQUE KEY `customer_memberships_active_key_key` (`active_key`),
  KEY `customer_memberships_tenant_id_customer_id_status_idx` (`tenant_id`,`customer_id`,`status`),
  KEY `customer_memberships_tenant_id_status_current_period_end_idx` (`tenant_id`,`status`,`current_period_end`),
  KEY `customer_memberships_plan_id_idx` (`plan_id`),
  KEY `customer_memberships_customer_id_fkey` (`customer_id`),
  CONSTRAINT `customer_memberships_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_memberships_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `customer_membership_plans` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_memberships_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_password_reset_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `used_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `requested_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_password_reset_tokens_token_hash_key` (`token_hash`),
  KEY `cust_pwd_reset_customer_used_exp_idx` (`customer_id`,`used_at`,`expires_at`),
  KEY `cust_pwd_reset_expires_at_idx` (`expires_at`),
  KEY `cust_pwd_reset_tenant_id_fkey` (`tenant_id`),
  CONSTRAINT `cust_pwd_reset_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cust_pwd_reset_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_recovery_executions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_recovery_executions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `rule_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `period_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('SENT','SKIPPED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SENT',
  `error` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_recovery_executions_public_id_key` (`public_id`),
  UNIQUE KEY `customer_recovery_executions_rule_id_customer_id_period_key_key` (`rule_id`,`customer_id`,`period_key`),
  KEY `customer_recovery_executions_tenant_id_fkey` (`tenant_id`),
  KEY `customer_recovery_executions_customer_id_fkey` (`customer_id`),
  CONSTRAINT `customer_recovery_executions_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_recovery_executions_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `customer_recovery_rules` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_recovery_executions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_recovery_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_recovery_rules` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `rule` enum('INACTIVE','CANCELED_NO_REBOOK','NO_SHOW_NO_REBOOK','POST_SERVICE_NO_RETURN','BIRTHDAY') COLLATE utf8mb4_unicode_ci NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `days` int NOT NULL DEFAULT '30',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_recovery_rules_public_id_key` (`public_id`),
  UNIQUE KEY `customer_recovery_rules_tenant_id_rule_key` (`tenant_id`,`rule`),
  CONSTRAINT `customer_recovery_rules_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_sessions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `last_seen_at` datetime(3) NOT NULL,
  `revoked_at` datetime(3) DEFAULT NULL,
  `revocation_reason` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_sessions_public_id_key` (`public_id`),
  UNIQUE KEY `customer_sessions_token_hash_key` (`token_hash`),
  KEY `customer_sessions_customer_id_revoked_at_expires_at_idx` (`customer_id`,`revoked_at`,`expires_at`),
  KEY `customer_sessions_tenant_id_customer_id_idx` (`tenant_id`,`customer_id`),
  CONSTRAINT `customer_sessions_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_sessions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `primary_unit_id` bigint unsigned DEFAULT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `social_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `whatsapp` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `document` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `source` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MANUAL',
  `accepts_communications` tinyint(1) NOT NULL DEFAULT '0',
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `google_sub` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo_path` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `custom_fields` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `customers_public_id_key` (`public_id`),
  UNIQUE KEY `customers_tenant_id_phone_key` (`tenant_id`,`phone`),
  UNIQUE KEY `customers_tenant_id_email_key` (`tenant_id`,`email`),
  UNIQUE KEY `customers_tenant_id_google_sub_key` (`tenant_id`,`google_sub`),
  KEY `customers_tenant_id_status_name_idx` (`tenant_id`,`status`,`name`),
  KEY `customers_tenant_id_primary_unit_id_idx` (`tenant_id`,`primary_unit_id`),
  KEY `customers_primary_unit_id_fkey` (`primary_unit_id`),
  CONSTRAINT `customers_primary_unit_id_fkey` FOREIGN KEY (`primary_unit_id`) REFERENCES `business_units` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `customers_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `debt_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `debt_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `debt_id` bigint unsigned NOT NULL,
  `event_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `debt_events_public_id_key` (`public_id`),
  KEY `debt_events_tenant_id_debt_id_created_at_idx` (`tenant_id`,`debt_id`,`created_at`),
  KEY `debt_events_debt_id_fkey` (`debt_id`),
  CONSTRAINT `debt_events_debt_id_fkey` FOREIGN KEY (`debt_id`) REFERENCES `debts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `debt_events_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `debt_payment_allocations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `debt_payment_allocations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `debt_id` bigint unsigned NOT NULL,
  `payment_id` bigint unsigned NOT NULL,
  `amount_cents` bigint unsigned NOT NULL,
  `source` enum('BOT_PIX','MANUAL','APPOINTMENT_PAYMENT','OTHER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `debt_payment_allocations_public_id_key` (`public_id`),
  UNIQUE KEY `debt_payment_allocations_debt_id_payment_id_key` (`debt_id`,`payment_id`),
  KEY `debt_payment_allocations_tenant_id_debt_id_idx` (`tenant_id`,`debt_id`),
  KEY `debt_payment_allocations_payment_id_fkey` (`payment_id`),
  CONSTRAINT `debt_payment_allocations_debt_id_fkey` FOREIGN KEY (`debt_id`) REFERENCES `debts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `debt_payment_allocations_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `debt_payment_allocations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `debts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `debts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `unit_id` bigint unsigned DEFAULT NULL,
  `origin_type` enum('APPOINTMENT','MANUAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `origin_appointment_id` bigint unsigned DEFAULT NULL,
  `customer_id` bigint unsigned DEFAULT NULL,
  `debtor_name` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `debtor_whatsapp` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `debtor_email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `debtor_document` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_amount_cents` bigint unsigned NOT NULL,
  `current_balance_cents` bigint unsigned NOT NULL,
  `due_date` date NOT NULL,
  `status` enum('OPEN','COLLECTING','WAITING_RESPONSE','PROMISE_SCHEDULED','PIX_PENDING','PARTIALLY_PAID','PROMISE_OVERDUE','NEGOTIATING','DISPUTED','HUMAN_SUPPORT','PAUSED','PAID','CANCELED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `balance_sync_pending` tinyint(1) NOT NULL DEFAULT '0',
  `collection_rule_id` bigint unsigned NOT NULL,
  `collection_paused_at` datetime(3) DEFAULT NULL,
  `collection_paused_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `human_support_at` datetime(3) DEFAULT NULL,
  `disputed_at` datetime(3) DEFAULT NULL,
  `paid_at` datetime(3) DEFAULT NULL,
  `canceled_at` datetime(3) DEFAULT NULL,
  `canceled_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by_user_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `debts_public_id_key` (`public_id`),
  KEY `debts_tenant_id_status_due_date_idx` (`tenant_id`,`status`,`due_date`),
  KEY `debts_tenant_id_debtor_whatsapp_idx` (`tenant_id`,`debtor_whatsapp`),
  KEY `debts_tenant_id_customer_id_idx` (`tenant_id`,`customer_id`),
  KEY `debts_tenant_id_origin_appointment_id_idx` (`tenant_id`,`origin_appointment_id`),
  KEY `debts_tenant_id_collection_rule_id_status_idx` (`tenant_id`,`collection_rule_id`,`status`),
  KEY `debts_origin_type_balance_sync_pending_status_idx` (`origin_type`,`balance_sync_pending`,`status`),
  KEY `debts_unit_id_fkey` (`unit_id`),
  KEY `debts_origin_appointment_id_fkey` (`origin_appointment_id`),
  KEY `debts_customer_id_fkey` (`customer_id`),
  KEY `debts_collection_rule_id_fkey` (`collection_rule_id`),
  KEY `debts_created_by_user_id_fkey` (`created_by_user_id`),
  CONSTRAINT `debts_collection_rule_id_fkey` FOREIGN KEY (`collection_rule_id`) REFERENCES `collection_rules` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `debts_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `debts_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `debts_origin_appointment_id_fkey` FOREIGN KEY (`origin_appointment_id`) REFERENCES `appointments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `debts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `debts_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `business_units` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `directory_business_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `directory_business_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` bigint unsigned NOT NULL,
  `type` enum('BUSINESS_VIEW','WHATSAPP_CLICK') COLLATE utf8mb4_unicode_ci NOT NULL,
  `visitor_hash` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `session_hash` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `referrer` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `utm_source` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `utm_medium` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `utm_campaign` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `directory_business_events_public_id_key` (`public_id`),
  KEY `directory_business_events_business_id_type_created_at_idx` (`business_id`,`type`,`created_at`),
  KEY `directory_business_events_type_created_at_idx` (`type`,`created_at`),
  KEY `directory_business_events_visitor_hash_business_id_type_crea_idx` (`visitor_hash`,`business_id`,`type`,`created_at`),
  CONSTRAINT `directory_business_events_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `directory_businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `directory_businesses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `directory_businesses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_id` bigint unsigned NOT NULL,
  `tenant_id` bigint unsigned DEFAULT NULL,
  `source_local_id` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_segment_key` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_search_term` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_slug` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `raw_address` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `street` varchar(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `number` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `complement` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `neighborhood` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `state` char(2) COLLATE utf8mb4_unicode_ci NOT NULL,
  `postal_code` char(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ibge_code` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `whatsapp` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `website_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `relevance_score` int DEFAULT NULL,
  `review_status` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `indexable` tinyint(1) NOT NULL DEFAULT '1',
  `seo_quality_score` tinyint unsigned NOT NULL DEFAULT '0',
  `seo_eligible` tinyint(1) NOT NULL DEFAULT '0',
  `seo_evaluated_at` datetime(3) DEFAULT NULL,
  `source_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_imported_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_imported_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `claimed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `directory_businesses_public_id_key` (`public_id`),
  UNIQUE KEY `udb_category_city_slug` (`category_id`,`state`,`city_slug`,`slug`),
  KEY `directory_businesses_category_id_city_slug_active_idx` (`category_id`,`city_slug`,`active`),
  KEY `directory_businesses_city_state_idx` (`city`,`state`),
  KEY `directory_businesses_ibge_code_idx` (`ibge_code`),
  KEY `directory_businesses_whatsapp_idx` (`whatsapp`),
  KEY `directory_businesses_phone_idx` (`phone`),
  KEY `directory_businesses_tenant_id_idx` (`tenant_id`),
  KEY `directory_businesses_seo_eligible_active_idx` (`seo_eligible`,`active`),
  KEY `directory_businesses_category_id_seo_eligible_idx` (`category_id`,`seo_eligible`),
  CONSTRAINT `directory_businesses_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `directory_categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `directory_businesses_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `directory_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `directory_categories` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `singular_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plural_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `seo_title` varchar(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `seo_description` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `icon` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `indexable` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `external_search_terms` json DEFAULT NULL,
  `external_negative_terms` json DEFAULT NULL,
  `geoapify_categories` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `directory_categories_public_id_key` (`public_id`),
  UNIQUE KEY `directory_categories_slug_key` (`slug`),
  KEY `directory_categories_active_sort_order_idx` (`active`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `directory_city_aggregate_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `directory_city_aggregate_jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_id` bigint unsigned NOT NULL,
  `city_slug` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `attempts` int NOT NULL DEFAULT '0',
  `pending_key` varchar(220) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `next_attempt_at` datetime(3) DEFAULT NULL,
  `last_error` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  `processed_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `directory_city_aggregate_jobs_public_id_key` (`public_id`),
  UNIQUE KEY `udcaj_pending_key` (`pending_key`),
  KEY `directory_city_aggregate_jobs_status_next_attempt_at_idx` (`status`,`next_attempt_at`),
  KEY `directory_city_aggregate_jobs_category_id_city_slug_idx` (`category_id`,`city_slug`),
  CONSTRAINT `directory_city_aggregate_jobs_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `directory_categories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `directory_city_aggregates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `directory_city_aggregates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `category_id` bigint unsigned NOT NULL,
  `city_slug` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `state` char(2) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_count` int NOT NULL DEFAULT '0',
  `seo_eligible_business_count` int NOT NULL DEFAULT '0',
  `whatsapp_count` int NOT NULL DEFAULT '0',
  `top_neighborhoods` json NOT NULL,
  `last_business_updated_at` datetime(3) DEFAULT NULL,
  `seo_eligible` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `udca_category_city` (`category_id`,`city_slug`),
  KEY `directory_city_aggregates_category_id_seo_eligible_idx` (`category_id`,`seo_eligible`),
  KEY `directory_city_aggregates_seo_eligible_business_count_idx` (`seo_eligible_business_count`),
  CONSTRAINT `directory_city_aggregates_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `directory_categories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `directory_external_search_cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `directory_external_search_cache` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cache_key` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_id` bigint unsigned NOT NULL,
  `cep` char(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `radius` int NOT NULL,
  `results` json NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `directory_external_search_cache_cache_key_key` (`cache_key`),
  KEY `directory_external_search_cache_category_id_cep_radius_idx` (`category_id`,`cep`,`radius`),
  CONSTRAINT `directory_external_search_cache_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `directory_categories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `directory_import_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `directory_import_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `import_id` bigint unsigned NOT NULL,
  `category_id` bigint unsigned DEFAULT NULL,
  `business_id` bigint unsigned DEFAULT NULL,
  `source_local_id` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category_detected` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('CREATED','UPDATED','UNCHANGED','POSSIBLE_DUPLICATE','SKIPPED','ERROR') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SKIPPED',
  `position` int NOT NULL,
  `source_data` json NOT NULL,
  `message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `udi_import_position` (`import_id`,`position`),
  KEY `directory_import_items_import_id_status_idx` (`import_id`,`status`),
  KEY `directory_import_items_category_id_fkey` (`category_id`),
  KEY `directory_import_items_business_id_fkey` (`business_id`),
  CONSTRAINT `directory_import_items_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `directory_businesses` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `directory_import_items_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `directory_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `directory_import_items_import_id_fkey` FOREIGN KEY (`import_id`) REFERENCES `directory_imports` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `directory_imports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `directory_imports` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ANALYZED','QUEUED','PROCESSING','PAUSED','COMPLETED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ANALYZED',
  `total_found` int NOT NULL DEFAULT '0',
  `total_selected` int NOT NULL DEFAULT '0',
  `total_created` int NOT NULL DEFAULT '0',
  `total_updated` int NOT NULL DEFAULT '0',
  `total_unchanged` int NOT NULL DEFAULT '0',
  `total_duplicates` int NOT NULL DEFAULT '0',
  `processed_count` int NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `directory_imports_public_id_key` (`public_id`),
  KEY `directory_imports_status_created_at_idx` (`status`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `directory_location_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `directory_location_config` (
  `id` bigint unsigned NOT NULL DEFAULT '1',
  `geoapify_api_key_encrypted` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `directory_postal_code_cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `directory_postal_code_cache` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cep` char(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `state` char(2) COLLATE utf8mb4_unicode_ci NOT NULL,
  `neighborhood` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `street` varchar(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `latitude` double DEFAULT NULL,
  `longitude` double DEFAULT NULL,
  `provider` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `directory_postal_code_cache_cep_key` (`cep`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `directory_seo_daily_metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `directory_seo_daily_metrics` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `page_url` varchar(700) COLLATE utf8mb4_unicode_ci NOT NULL,
  `page_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` bigint unsigned DEFAULT NULL,
  `category_id` bigint unsigned DEFAULT NULL,
  `city_slug` varchar(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `clicks` double NOT NULL DEFAULT '0',
  `impressions` double NOT NULL DEFAULT '0',
  `ctr` double NOT NULL DEFAULT '0',
  `position` double NOT NULL DEFAULT '0',
  `synced_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `udsdm_date_page` (`date`,`page_hash`),
  KEY `directory_seo_daily_metrics_date_idx` (`date`),
  KEY `directory_seo_daily_metrics_business_id_date_idx` (`business_id`,`date`),
  KEY `directory_seo_daily_metrics_category_id_date_idx` (`category_id`,`date`),
  CONSTRAINT `directory_seo_daily_metrics_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `directory_businesses` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `directory_seo_daily_metrics_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `directory_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `directory_seo_query_metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `directory_seo_query_metrics` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `page_url` varchar(700) COLLATE utf8mb4_unicode_ci NOT NULL,
  `page_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `query` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` bigint unsigned DEFAULT NULL,
  `category_id` bigint unsigned DEFAULT NULL,
  `city_slug` varchar(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `clicks` double NOT NULL DEFAULT '0',
  `impressions` double NOT NULL DEFAULT '0',
  `ctr` double NOT NULL DEFAULT '0',
  `position` double NOT NULL DEFAULT '0',
  `synced_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `udsqm_date_page_query` (`date`,`page_hash`,`query`),
  KEY `directory_seo_query_metrics_date_idx` (`date`),
  KEY `directory_seo_query_metrics_business_id_date_idx` (`business_id`,`date`),
  KEY `directory_seo_query_metrics_category_id_date_idx` (`category_id`,`date`),
  CONSTRAINT `directory_seo_query_metrics_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `directory_businesses` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `directory_seo_query_metrics_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `directory_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `directory_seo_sync_runs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `directory_seo_sync_runs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','PROCESSING','DONE','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `from_date` date NOT NULL,
  `to_date` date NOT NULL,
  `attempts` int NOT NULL DEFAULT '0',
  `last_error` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `started_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `directory_seo_sync_runs_public_id_key` (`public_id`),
  KEY `directory_seo_sync_runs_status_created_at_idx` (`status`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `external_integrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `external_integrations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `endpoint` varchar(2048) COLLATE utf8mb4_unicode_ci NOT NULL,
  `encrypted_secret` text COLLATE utf8mb4_unicode_ci,
  `events` json NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `external_integrations_public_id_key` (`public_id`),
  UNIQUE KEY `external_integrations_tenant_id_name_key` (`tenant_id`,`name`),
  KEY `external_integrations_tenant_id_active_idx` (`tenant_id`,`active`),
  CONSTRAINT `external_integrations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `financial_closings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `financial_closings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `unit_id` bigint unsigned DEFAULT NULL,
  `period_from` datetime(3) NOT NULL,
  `period_to` datetime(3) NOT NULL,
  `total_received_cents` bigint unsigned NOT NULL,
  `total_canceled_cents` bigint unsigned NOT NULL,
  `deposit_total_cents` bigint unsigned NOT NULL,
  `manual_in_cents` bigint unsigned NOT NULL,
  `manual_out_cents` bigint unsigned NOT NULL,
  `cash_movements_net_cents` bigint NOT NULL,
  `commissions_total_cents` bigint unsigned NOT NULL,
  `balance_cents` bigint NOT NULL,
  `payment_method_breakdown` json NOT NULL,
  `status` enum('ACTIVE','CANCELED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `closed_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `closed_by_user_id` bigint unsigned DEFAULT NULL,
  `closed_by_session_id` bigint unsigned DEFAULT NULL,
  `canceled_at` datetime(3) DEFAULT NULL,
  `canceled_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `financial_closings_public_id_key` (`public_id`),
  KEY `financial_closings_tenant_id_unit_id_period_from_period_to_idx` (`tenant_id`,`unit_id`,`period_from`,`period_to`),
  KEY `financial_closings_tenant_id_status_idx` (`tenant_id`,`status`),
  KEY `financial_closings_unit_id_fkey` (`unit_id`),
  KEY `financial_closings_closed_by_user_id_fkey` (`closed_by_user_id`),
  KEY `financial_closings_closed_by_session_id_fkey` (`closed_by_session_id`),
  CONSTRAINT `financial_closings_closed_by_session_id_fkey` FOREIGN KEY (`closed_by_session_id`) REFERENCES `user_sessions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `financial_closings_closed_by_user_id_fkey` FOREIGN KEY (`closed_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `financial_closings_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `financial_closings_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `business_units` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `loyalty_ledger_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `loyalty_ledger_entries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `type` enum('POINTS','CASHBACK') COLLATE utf8mb4_unicode_ci NOT NULL,
  `direction` enum('CREDIT','DEBIT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` enum('EARNED','REDEEMED','EXPIRED','REVERSED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` bigint unsigned NOT NULL,
  `discount_cents_applied` bigint unsigned DEFAULT NULL,
  `source_payment_id` bigint unsigned DEFAULT NULL,
  `source_appointment_id` bigint unsigned DEFAULT NULL,
  `related_entry_id` bigint unsigned DEFAULT NULL,
  `expires_at` datetime(3) DEFAULT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `session_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `loyalty_ledger_entries_public_id_key` (`public_id`),
  UNIQUE KEY `loyalty_ledger_entries_related_entry_id_key` (`related_entry_id`),
  UNIQUE KEY `loyalty_ledger_entries_tenant_type_payment_direction_key` (`tenant_id`,`type`,`source_payment_id`,`direction`),
  KEY `loyalty_ledger_entries_tenant_id_customer_id_type_idx` (`tenant_id`,`customer_id`,`type`),
  KEY `loyalty_ledger_entries_tenant_id_type_expires_at_idx` (`tenant_id`,`type`,`expires_at`),
  KEY `loyalty_ledger_entries_tenant_id_source_appointment_id_idx` (`tenant_id`,`source_appointment_id`),
  KEY `loyalty_ledger_entries_customer_id_fkey` (`customer_id`),
  KEY `loyalty_ledger_entries_source_payment_id_fkey` (`source_payment_id`),
  KEY `loyalty_ledger_entries_source_appointment_id_fkey` (`source_appointment_id`),
  KEY `loyalty_ledger_entries_user_id_fkey` (`user_id`),
  KEY `loyalty_ledger_entries_session_id_fkey` (`session_id`),
  CONSTRAINT `loyalty_ledger_entries_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `loyalty_ledger_entries_related_entry_id_fkey` FOREIGN KEY (`related_entry_id`) REFERENCES `loyalty_ledger_entries` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `loyalty_ledger_entries_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `user_sessions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `loyalty_ledger_entries_source_appointment_id_fkey` FOREIGN KEY (`source_appointment_id`) REFERENCES `appointments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `loyalty_ledger_entries_source_payment_id_fkey` FOREIGN KEY (`source_payment_id`) REFERENCES `payments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `loyalty_ledger_entries_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `loyalty_ledger_entries_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `loyalty_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `loyalty_rules` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `type` enum('POINTS','CASHBACK') COLLATE utf8mb4_unicode_ci NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '0',
  `earn_rate` int unsigned NOT NULL,
  `min_eligible_amount_cents` bigint unsigned NOT NULL DEFAULT '0',
  `redeem_rate_cents_per_point` int unsigned DEFAULT NULL,
  `expiration_days` smallint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `loyalty_rules_public_id_key` (`public_id`),
  UNIQUE KEY `loyalty_rules_tenant_id_type_key` (`tenant_id`,`type`),
  CONSTRAINT `loyalty_rules_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_campaign_recipients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_campaign_recipients` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `campaign_id` bigint unsigned NOT NULL,
  `target_public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `notification_campaign_recipients_public_id_key` (`public_id`),
  UNIQUE KEY `ucr_campaign_target` (`campaign_id`,`target_public_id`),
  KEY `notification_campaign_recipients_campaign_id_status_id_idx` (`campaign_id`,`status`,`id`),
  CONSTRAINT `notification_campaign_recipients_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `notification_campaigns` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_campaigns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_campaigns` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `idempotency_key` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `audience` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `channel` enum('EMAIL','PUSH','WHATSAPP','WEBHOOK') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('QUEUED','PROCESSING','COMPLETED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'QUEUED',
  `recipient_count` int unsigned NOT NULL DEFAULT '0',
  `eligible_count` int unsigned NOT NULL DEFAULT '0',
  `skipped_count` int unsigned NOT NULL DEFAULT '0',
  `delivery_count` int unsigned NOT NULL DEFAULT '0',
  `materialized_count` int unsigned NOT NULL DEFAULT '0',
  `started_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `notification_campaigns_public_id_key` (`public_id`),
  UNIQUE KEY `notification_campaigns_tenant_id_idempotency_key_key` (`tenant_id`,`idempotency_key`),
  KEY `notification_campaigns_tenant_id_created_at_idx` (`tenant_id`,`created_at`),
  KEY `notification_campaigns_status_created_at_idx` (`status`,`created_at`),
  CONSTRAINT `notification_campaigns_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `channel` enum('EMAIL','PUSH','WHATSAPP','WEBHOOK') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EMAIL',
  `kind` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_type` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_public_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recipient` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','PROCESSING','SENT','FAILED','SKIPPED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `attempts` tinyint unsigned NOT NULL DEFAULT '0',
  `last_error` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scheduled_at` datetime(3) DEFAULT NULL,
  `sent_at` datetime(3) DEFAULT NULL,
  `whatsapp_buttons` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `notification_logs_public_id_key` (`public_id`),
  UNIQUE KEY `notification_logs_target_key` (`tenant_id`,`kind`,`target_type`,`target_public_id`,`channel`,`recipient`),
  KEY `notification_logs_tenant_id_created_at_idx` (`tenant_id`,`created_at`),
  KEY `notification_logs_tenant_id_status_idx` (`tenant_id`,`status`),
  KEY `notification_logs_target_type_target_public_id_idx` (`target_type`,`target_public_id`),
  CONSTRAINT `notification_logs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_templates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `kind` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `whatsapp_body` text COLLATE utf8mb4_unicode_ci,
  `whatsapp_buttons` json DEFAULT NULL,
  `whatsapp_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `notification_templates_public_id_key` (`public_id`),
  UNIQUE KEY `notification_templates_tenant_id_kind_key` (`tenant_id`,`kind`),
  CONSTRAINT `notification_templates_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_reset_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `used_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `requested_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `password_reset_tokens_token_hash_key` (`token_hash`),
  KEY `password_reset_tokens_user_id_used_at_expires_at_idx` (`user_id`,`used_at`,`expires_at`),
  KEY `password_reset_tokens_expires_at_idx` (`expires_at`),
  CONSTRAINT `password_reset_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_gateway_charges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_gateway_charges` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `origin_type` enum('APPOINTMENT','DEBT') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'APPOINTMENT',
  `appointment_id` bigint unsigned DEFAULT NULL,
  `debt_id` bigint unsigned DEFAULT NULL,
  `payment_id` bigint unsigned DEFAULT NULL,
  `provider` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `environment` enum('SANDBOX','PRODUCTION') COLLATE utf8mb4_unicode_ci NOT NULL,
  `kind` enum('PAYMENT','DEPOSIT') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PAYMENT',
  `external_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('PENDING','PROCESSING','PAID','FAILED','CANCELED','EXPIRED','REFUNDED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `amount_cents` bigint unsigned NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `idempotency_key` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pix_copy_paste` text COLLATE utf8mb4_unicode_ci,
  `last_checked_at` datetime(3) DEFAULT NULL,
  `reconciled_at` datetime(3) DEFAULT NULL,
  `canceled_at` datetime(3) DEFAULT NULL,
  `canceled_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_gateway_charges_public_id_key` (`public_id`),
  UNIQUE KEY `payment_gateway_charges_tenant_id_idempotency_key_key` (`tenant_id`,`idempotency_key`),
  UNIQUE KEY `payment_gateway_charges_payment_id_key` (`payment_id`),
  KEY `payment_gateway_charges_tenant_id_appointment_id_idx` (`tenant_id`,`appointment_id`),
  KEY `payment_gateway_charges_tenant_id_debt_id_idx` (`tenant_id`,`debt_id`),
  KEY `payment_gateway_charges_tenant_id_status_idx` (`tenant_id`,`status`),
  KEY `payment_gateway_charges_tenant_id_provider_external_id_idx` (`tenant_id`,`provider`,`external_id`),
  KEY `payment_gateway_charges_appointment_id_fkey` (`appointment_id`),
  KEY `payment_gateway_charges_debt_id_fkey` (`debt_id`),
  CONSTRAINT `payment_gateway_charges_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payment_gateway_charges_debt_id_fkey` FOREIGN KEY (`debt_id`) REFERENCES `debts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payment_gateway_charges_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payment_gateway_charges_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_gateway_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_gateway_configs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `provider` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '0',
  `environment` enum('SANDBOX','PRODUCTION') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SANDBOX',
  `credentials_ciphertext` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_gateway_configs_public_id_key` (`public_id`),
  UNIQUE KEY `payment_gateway_configs_tenant_id_provider_key` (`tenant_id`,`provider`),
  CONSTRAINT `payment_gateway_configs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_gateway_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_gateway_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `charge_id` bigint unsigned DEFAULT NULL,
  `provider` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `direction` enum('OUTBOUND','INBOUND') COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_type` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `external_event_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payload` json DEFAULT NULL,
  `status_code` smallint unsigned DEFAULT NULL,
  `success` tinyint(1) NOT NULL,
  `error_message` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_gateway_events_public_id_key` (`public_id`),
  UNIQUE KEY `payment_gateway_events_tenant_id_provider_external_event_id_key` (`tenant_id`,`provider`,`external_event_id`),
  KEY `payment_gateway_events_tenant_id_charge_id_created_at_idx` (`tenant_id`,`charge_id`,`created_at`),
  KEY `payment_gateway_events_charge_id_fkey` (`charge_id`),
  CONSTRAINT `payment_gateway_events_charge_id_fkey` FOREIGN KEY (`charge_id`) REFERENCES `payment_gateway_charges` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payment_gateway_events_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_methods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_methods` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('CASH','PIX','DEBIT_CARD','CREDIT_CARD','BANK_TRANSFER','OTHER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_methods_public_id_key` (`public_id`),
  UNIQUE KEY `payment_methods_tenant_id_name_key` (`tenant_id`,`name`),
  KEY `payment_methods_tenant_id_active_sort_order_idx` (`tenant_id`,`active`,`sort_order`),
  CONSTRAINT `payment_methods_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_promises`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_promises` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `debt_id` bigint unsigned NOT NULL,
  `promised_date` date NOT NULL,
  `promised_amount_cents` bigint unsigned DEFAULT NULL,
  `status` enum('ACTIVE','FULFILLED','OVERDUE','REPLACED','CANCELED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `source` enum('WHATSAPP','MANUAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `due_reminder_sent_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_promises_public_id_key` (`public_id`),
  KEY `payment_promises_tenant_id_debt_id_status_idx` (`tenant_id`,`debt_id`,`status`),
  KEY `payment_promises_status_promised_date_idx` (`status`,`promised_date`),
  KEY `payment_promises_debt_id_fkey` (`debt_id`),
  CONSTRAINT `payment_promises_debt_id_fkey` FOREIGN KEY (`debt_id`) REFERENCES `debts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payment_promises_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `origin_type` enum('APPOINTMENT','MEMBERSHIP_CHARGE','DEBT') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'APPOINTMENT',
  `appointment_id` bigint unsigned DEFAULT NULL,
  `membership_charge_id` bigint unsigned DEFAULT NULL,
  `debt_id` bigint unsigned DEFAULT NULL,
  `payment_method_id` bigint unsigned NOT NULL,
  `kind` enum('PAYMENT','DEPOSIT') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PAYMENT',
  `status` enum('PAID','CANCELED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PAID',
  `amount_cents` bigint unsigned NOT NULL,
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `session_id` bigint unsigned DEFAULT NULL,
  `canceled_at` datetime(3) DEFAULT NULL,
  `canceled_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `payments_public_id_key` (`public_id`),
  KEY `payments_tenant_id_appointment_id_created_at_idx` (`tenant_id`,`appointment_id`,`created_at`),
  KEY `payments_tenant_id_membership_charge_id_created_at_idx` (`tenant_id`,`membership_charge_id`,`created_at`),
  KEY `payments_tenant_id_debt_id_created_at_idx` (`tenant_id`,`debt_id`,`created_at`),
  KEY `payments_tenant_id_status_created_at_idx` (`tenant_id`,`status`,`created_at`),
  KEY `payments_origin_type_idx` (`origin_type`),
  KEY `payments_appointment_id_fkey` (`appointment_id`),
  KEY `payments_membership_charge_id_fkey` (`membership_charge_id`),
  KEY `payments_debt_id_fkey` (`debt_id`),
  KEY `payments_payment_method_id_fkey` (`payment_method_id`),
  KEY `payments_user_id_fkey` (`user_id`),
  KEY `payments_session_id_fkey` (`session_id`),
  CONSTRAINT `payments_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payments_debt_id_fkey` FOREIGN KEY (`debt_id`) REFERENCES `debts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payments_membership_charge_id_fkey` FOREIGN KEY (`membership_charge_id`) REFERENCES `customer_membership_charges` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payments_payment_method_id_fkey` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payments_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `user_sessions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payments_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `permissions_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `plan_benefits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `plan_benefits` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_id` bigint unsigned NOT NULL,
  `text` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `plan_benefits_public_id_key` (`public_id`),
  KEY `plan_benefits_plan_id_sort_order_idx` (`plan_id`,`sort_order`),
  CONSTRAINT `plan_benefits_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `commercial_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `plan_billing_options`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `plan_billing_options` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_id` bigint unsigned NOT NULL,
  `billing_cycle` enum('MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL','CUSTOM') COLLATE utf8mb4_unicode_ci NOT NULL,
  `price_cents` bigint unsigned NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `recommended` tinyint(1) NOT NULL DEFAULT '0',
  `stripe_price_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `plan_billing_options_public_id_key` (`public_id`),
  UNIQUE KEY `plan_billing_options_plan_id_billing_cycle_key` (`plan_id`,`billing_cycle`),
  UNIQUE KEY `plan_billing_options_stripe_price_id_key` (`stripe_price_id`),
  KEY `plan_billing_options_plan_id_active_sort_order_idx` (`plan_id`,`active`,`sort_order`),
  CONSTRAINT `plan_billing_options_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `commercial_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `plan_limits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `plan_limits` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `plan_id` bigint unsigned NOT NULL,
  `key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value_type` enum('INTEGER','BOOLEAN','STRING') COLLATE utf8mb4_unicode_ci NOT NULL,
  `integer_value` bigint unsigned DEFAULT NULL,
  `boolean_value` tinyint(1) DEFAULT NULL,
  `string_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `plan_limits_plan_id_key_key` (`plan_id`,`key`),
  CONSTRAINT `plan_limits_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `commercial_plans` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `platform_administrator_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform_administrator_roles` (
  `administrator_id` bigint unsigned NOT NULL,
  `role_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`administrator_id`,`role_id`),
  KEY `platform_administrator_roles_role_id_idx` (`role_id`),
  CONSTRAINT `platform_administrator_roles_administrator_id_fkey` FOREIGN KEY (`administrator_id`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `platform_administrator_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `platform_roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `platform_administrators`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform_administrators` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `status` enum('ACTIVE','SUSPENDED','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `created_by_user_id` bigint unsigned DEFAULT NULL,
  `last_access_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_administrators_public_id_key` (`public_id`),
  UNIQUE KEY `platform_administrators_user_id_key` (`user_id`),
  KEY `platform_administrators_status_idx` (`status`),
  KEY `platform_administrators_created_by_user_id_idx` (`created_by_user_id`),
  CONSTRAINT `platform_administrators_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `platform_administrators_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `platform_ledger_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform_ledger_entries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned DEFAULT NULL,
  `subscription_id` bigint unsigned DEFAULT NULL,
  `manual_payment_id` bigint unsigned DEFAULT NULL,
  `platform_charge_id` bigint unsigned DEFAULT NULL,
  `amount_cents` bigint NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_ledger_entries_public_id_key` (`public_id`),
  KEY `platform_ledger_entries_tenant_id_created_at_idx` (`tenant_id`,`created_at`),
  KEY `platform_ledger_entries_subscription_id_created_at_idx` (`subscription_id`,`created_at`),
  KEY `platform_ledger_entries_manual_payment_id_idx` (`manual_payment_id`),
  KEY `platform_ledger_entries_platform_charge_id_type_idx` (`platform_charge_id`,`type`),
  CONSTRAINT `platform_ledger_entries_manual_payment_id_fk` FOREIGN KEY (`manual_payment_id`) REFERENCES `commercial_manual_payments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `platform_ledger_entries_platform_charge_id_fk` FOREIGN KEY (`platform_charge_id`) REFERENCES `platform_subscription_charges` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `platform_ledger_entries_subscription_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `platform_ledger_entries_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `platform_payment_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform_payment_configs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '0',
  `environment` enum('SANDBOX','PRODUCTION') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SANDBOX',
  `credentials_ciphertext` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_payment_configs_public_id_key` (`public_id`),
  UNIQUE KEY `platform_payment_configs_provider_key` (`provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `platform_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform_permissions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_permissions_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `platform_role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform_role_permissions` (
  `role_id` bigint unsigned NOT NULL,
  `permission_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `platform_role_permissions_permission_id_idx` (`permission_id`),
  CONSTRAINT `platform_role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `platform_permissions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `platform_role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `platform_roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `platform_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform_roles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_roles_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `platform_subscription_charges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform_subscription_charges` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subscription_id` bigint unsigned NOT NULL,
  `provider` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `environment` enum('SANDBOX','PRODUCTION') COLLATE utf8mb4_unicode_ci NOT NULL,
  `external_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('PENDING','PROCESSING','PAID','FAILED','CANCELED','EXPIRED','REFUNDED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `amount_cents` bigint unsigned NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `idempotency_key` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pix_copy_paste` text COLLATE utf8mb4_unicode_ci,
  `paid_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_subscription_charges_public_id_key` (`public_id`),
  UNIQUE KEY `platform_subscription_charges_idempotency_key_key` (`idempotency_key`),
  UNIQUE KEY `platform_subscription_charges_provider_external_id_key` (`provider`,`external_id`),
  KEY `platform_subscription_charges_subscription_id_created_at_idx` (`subscription_id`,`created_at`),
  KEY `platform_subscription_charges_status_created_at_idx` (`status`,`created_at`),
  CONSTRAINT `platform_subscription_charges_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `platform_wapi_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform_wapi_configs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `master_api_key_ciphertext` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_wapi_configs_public_id_key` (`public_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `platform_whatsapp_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform_whatsapp_configs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone_number_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_account_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `accessToken` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_whatsapp_configs_public_id_key` (`public_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `product_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_categories` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_categories_public_id_key` (`public_id`),
  UNIQUE KEY `product_categories_tenant_id_name_key` (`tenant_id`,`name`),
  KEY `product_categories_tenant_id_active_name_idx` (`tenant_id`,`active`,`name`),
  CONSTRAINT `product_categories_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `product_sale_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_sale_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `sale_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  `quantity` int unsigned NOT NULL,
  `unit_price_cents` bigint unsigned NOT NULL,
  `total_cents` bigint unsigned NOT NULL,
  `commission_type` enum('PERCENTAGE','FIXED') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `commission_value` int unsigned DEFAULT NULL,
  `commission_amount_cents` bigint unsigned NOT NULL DEFAULT '0',
  `stock_movement_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_sale_items_public_id_key` (`public_id`),
  UNIQUE KEY `product_sale_items_stock_movement_id_key` (`stock_movement_id`),
  KEY `product_sale_items_tenant_id_product_id_created_at_idx` (`tenant_id`,`product_id`,`created_at`),
  KEY `product_sale_items_sale_id_fkey` (`sale_id`),
  KEY `product_sale_items_product_id_fkey` (`product_id`),
  CONSTRAINT `product_sale_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sale_items_sale_id_fkey` FOREIGN KEY (`sale_id`) REFERENCES `product_sales` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sale_items_stock_movement_id_fkey` FOREIGN KEY (`stock_movement_id`) REFERENCES `stock_movements` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sale_items_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `product_sales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_sales` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `unit_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned DEFAULT NULL,
  `professional_id` bigint unsigned DEFAULT NULL,
  `payment_method_id` bigint unsigned NOT NULL,
  `cash_movement_id` bigint unsigned DEFAULT NULL,
  `total_cents` bigint unsigned NOT NULL,
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` bigint unsigned NOT NULL,
  `session_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_sales_public_id_key` (`public_id`),
  UNIQUE KEY `product_sales_cash_movement_id_key` (`cash_movement_id`),
  KEY `product_sales_tenant_id_unit_id_created_at_idx` (`tenant_id`,`unit_id`,`created_at`),
  KEY `product_sales_tenant_id_customer_id_created_at_idx` (`tenant_id`,`customer_id`,`created_at`),
  KEY `product_sales_tenant_id_professional_id_created_at_idx` (`tenant_id`,`professional_id`,`created_at`),
  KEY `product_sales_unit_id_fkey` (`unit_id`),
  KEY `product_sales_customer_id_fkey` (`customer_id`),
  KEY `product_sales_professional_id_fkey` (`professional_id`),
  KEY `product_sales_payment_method_id_fkey` (`payment_method_id`),
  KEY `product_sales_user_id_fkey` (`user_id`),
  KEY `product_sales_session_id_fkey` (`session_id`),
  CONSTRAINT `product_sales_cash_movement_id_fkey` FOREIGN KEY (`cash_movement_id`) REFERENCES `cash_movements` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sales_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sales_payment_method_id_fkey` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sales_professional_id_fkey` FOREIGN KEY (`professional_id`) REFERENCES `professionals` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sales_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `user_sessions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sales_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sales_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `business_units` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sales_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `product_stocks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_stocks` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  `business_unit_id` bigint unsigned NOT NULL,
  `quantity` int unsigned NOT NULL DEFAULT '0',
  `minimum_quantity` int unsigned NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_stocks_public_id_key` (`public_id`),
  UNIQUE KEY `product_stocks_product_id_business_unit_id_key` (`product_id`,`business_unit_id`),
  KEY `product_stocks_tenant_id_business_unit_id_idx` (`tenant_id`,`business_unit_id`),
  KEY `product_stocks_tenant_id_product_id_idx` (`tenant_id`,`product_id`),
  KEY `product_stocks_business_unit_id_fkey` (`business_unit_id`),
  CONSTRAINT `product_stocks_business_unit_id_fkey` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_stocks_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_stocks_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `category_id` bigint unsigned DEFAULT NULL,
  `name` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sku` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `barcode` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_path` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_alt` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cost_price_cents` bigint unsigned NOT NULL DEFAULT '0',
  `sale_price_cents` bigint unsigned NOT NULL,
  `commission_type` enum('PERCENTAGE','FIXED') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `commission_value` int unsigned DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `products_public_id_key` (`public_id`),
  UNIQUE KEY `products_tenant_id_name_key` (`tenant_id`,`name`),
  UNIQUE KEY `products_tenant_id_sku_key` (`tenant_id`,`sku`),
  UNIQUE KEY `products_tenant_id_barcode_key` (`tenant_id`,`barcode`),
  KEY `products_tenant_id_active_name_idx` (`tenant_id`,`active`,`name`),
  KEY `products_tenant_id_category_id_idx` (`tenant_id`,`category_id`),
  KEY `products_category_id_fkey` (`category_id`),
  CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `product_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `products_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `professional_commissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `professional_commissions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `payment_id` bigint unsigned NOT NULL,
  `professional_id` bigint unsigned NOT NULL,
  `appointment_id` bigint unsigned NOT NULL,
  `commission_type` enum('PERCENTAGE','FIXED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `commission_value` int unsigned NOT NULL,
  `rule_source` enum('OVERRIDE','DEFAULT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `base_amount_cents` bigint unsigned NOT NULL,
  `commission_amount_cents` bigint unsigned NOT NULL,
  `status` enum('ACTIVE','CANCELED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `canceled_at` datetime(3) DEFAULT NULL,
  `canceled_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `professional_commissions_public_id_key` (`public_id`),
  UNIQUE KEY `professional_commissions_payment_id_key` (`payment_id`),
  KEY `professional_commissions_tenant_id_professional_id_created_a_idx` (`tenant_id`,`professional_id`,`created_at`),
  KEY `professional_commissions_tenant_id_status_created_at_idx` (`tenant_id`,`status`,`created_at`),
  KEY `professional_commissions_professional_id_fkey` (`professional_id`),
  KEY `professional_commissions_appointment_id_fkey` (`appointment_id`),
  CONSTRAINT `professional_commissions_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `professional_commissions_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `professional_commissions_professional_id_fkey` FOREIGN KEY (`professional_id`) REFERENCES `professionals` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `professional_commissions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `professional_services`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `professional_services` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `professional_id` bigint unsigned NOT NULL,
  `service_id` bigint unsigned NOT NULL,
  `price_cents` bigint unsigned DEFAULT NULL,
  `duration_minutes` smallint unsigned DEFAULT NULL,
  `has_post_service_break` tinyint(1) DEFAULT NULL,
  `post_service_break_minutes` smallint unsigned DEFAULT NULL,
  `commission_type` enum('PERCENTAGE','FIXED') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `commission_value` int unsigned DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `professional_services_public_id_key` (`public_id`),
  UNIQUE KEY `professional_services_professional_id_service_id_key` (`professional_id`,`service_id`),
  KEY `professional_services_tenant_id_professional_id_active_idx` (`tenant_id`,`professional_id`,`active`),
  KEY `professional_services_tenant_id_service_id_active_idx` (`tenant_id`,`service_id`,`active`),
  KEY `professional_services_service_id_fkey` (`service_id`),
  CONSTRAINT `professional_services_professional_id_fkey` FOREIGN KEY (`professional_id`) REFERENCES `professionals` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `professional_services_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `professional_services_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `professional_unavailabilities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `professional_unavailabilities` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `professional_id` bigint unsigned NOT NULL,
  `unit_id` bigint unsigned DEFAULT NULL,
  `type` enum('BLOCK','DAY_OFF','VACATION','SICK_LEAVE','PERSONAL','OTHER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `starts_at` datetime(3) NOT NULL,
  `ends_at` datetime(3) NOT NULL,
  `all_day` tinyint(1) NOT NULL DEFAULT '0',
  `repeats_weekly` tinyint(1) NOT NULL DEFAULT '0',
  `recurrence_ends_at` datetime(3) DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `professional_unavailabilities_public_id_key` (`public_id`),
  KEY `professional_unavailabilities_tenant_id_professional_id_star_idx` (`tenant_id`,`professional_id`,`starts_at`,`ends_at`,`active`),
  KEY `professional_unavailabilities_tenant_id_type_active_idx` (`tenant_id`,`type`,`active`),
  KEY `professional_unavailabilities_professional_id_fkey` (`professional_id`),
  KEY `professional_unavailabilities_unit_id_fkey` (`unit_id`),
  CONSTRAINT `professional_unavailabilities_professional_id_fkey` FOREIGN KEY (`professional_id`) REFERENCES `professionals` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `professional_unavailabilities_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `professional_unavailabilities_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `business_units` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `professional_units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `professional_units` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `professional_id` bigint unsigned NOT NULL,
  `unit_id` bigint unsigned NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `professional_units_public_id_key` (`public_id`),
  UNIQUE KEY `professional_units_professional_id_unit_id_key` (`professional_id`,`unit_id`),
  KEY `professional_units_tenant_id_professional_id_active_idx` (`tenant_id`,`professional_id`,`active`),
  KEY `professional_units_tenant_id_unit_id_active_idx` (`tenant_id`,`unit_id`,`active`),
  KEY `professional_units_unit_id_fkey` (`unit_id`),
  CONSTRAINT `professional_units_professional_id_fkey` FOREIGN KEY (`professional_id`) REFERENCES `professionals` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `professional_units_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `professional_units_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `business_units` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `professional_work_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `professional_work_schedules` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `professional_id` bigint unsigned NOT NULL,
  `unit_id` bigint unsigned DEFAULT NULL,
  `weekday` tinyint unsigned NOT NULL,
  `starts_at` char(5) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ends_at` char(5) COLLATE utf8mb4_unicode_ci NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `professional_work_schedules_public_id_key` (`public_id`),
  KEY `professional_work_schedules_tenant_id_professional_id_weekda_idx` (`tenant_id`,`professional_id`,`weekday`,`active`),
  KEY `professional_work_schedules_professional_id_fkey` (`professional_id`),
  KEY `professional_work_schedules_unit_id_fkey` (`unit_id`),
  CONSTRAINT `professional_work_schedules_professional_id_fkey` FOREIGN KEY (`professional_id`) REFERENCES `professionals` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `professional_work_schedules_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `professional_work_schedules_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `business_units` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `professionals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `professionals` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `primary_unit_id` bigint unsigned DEFAULT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `public_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bio` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo_path` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `professional_document` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `specialties` json DEFAULT NULL,
  `calendar_color` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `commission_type` enum('PERCENTAGE','FIXED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PERCENTAGE',
  `commission_value` int unsigned NOT NULL DEFAULT '0',
  `custom_fields` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `professionals_public_id_key` (`public_id`),
  UNIQUE KEY `professionals_tenant_id_user_id_key` (`tenant_id`,`user_id`),
  KEY `professionals_tenant_id_active_sort_order_idx` (`tenant_id`,`active`,`sort_order`),
  KEY `professionals_tenant_id_primary_unit_id_idx` (`tenant_id`,`primary_unit_id`),
  KEY `professionals_primary_unit_id_fkey` (`primary_unit_id`),
  KEY `professionals_user_id_fkey` (`user_id`),
  CONSTRAINT `professionals_primary_unit_id_fkey` FOREIGN KEY (`primary_unit_id`) REFERENCES `business_units` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `professionals_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `professionals_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_campaigns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_campaigns` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('DRAFT','READY','RUNNING','PAUSED','COMPLETED','CANCELED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `category_id` bigint unsigned DEFAULT NULL,
  `state` char(2) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `daily_limit` smallint unsigned NOT NULL DEFAULT '100',
  `sending_start_minutes` smallint unsigned NOT NULL DEFAULT '540',
  `sending_end_minutes` smallint unsigned NOT NULL DEFAULT '1080',
  `min_interval_seconds` smallint unsigned NOT NULL DEFAULT '30',
  `max_interval_seconds` smallint unsigned NOT NULL DEFAULT '120',
  `allowed_weekdays` json NOT NULL,
  `follow_up_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `follow_up_after_hours` smallint unsigned DEFAULT NULL,
  `max_follow_ups` tinyint unsigned NOT NULL DEFAULT '2',
  `pause_on_reply` tinyint(1) NOT NULL DEFAULT '1',
  `pause_on_interest` tinyint(1) NOT NULL DEFAULT '1',
  `auto_reply_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `flow_id` bigint unsigned DEFAULT NULL,
  `started_at` datetime(3) DEFAULT NULL,
  `paused_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `next_send_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospecting_campaigns_public_id_key` (`public_id`),
  KEY `prospecting_campaigns_status_started_at_idx` (`status`,`started_at`),
  KEY `prospecting_campaigns_category_id_state_city_idx` (`category_id`,`state`,`city`),
  KEY `prospecting_campaigns_flow_id_fkey` (`flow_id`),
  CONSTRAINT `prospecting_campaigns_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `directory_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prospecting_campaigns_flow_id_fkey` FOREIGN KEY (`flow_id`) REFERENCES `prospecting_flows` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_contacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_contacts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `normalized_phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `first_inbound_at` datetime(3) DEFAULT NULL,
  `last_inbound_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospecting_contacts_public_id_key` (`public_id`),
  UNIQUE KEY `prospecting_contacts_normalized_phone_key` (`normalized_phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_conversations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_id` bigint unsigned NOT NULL,
  `instance_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ACTIVE','MANUAL','CLOSED','SUPPRESSED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `flow_id` bigint unsigned DEFAULT NULL,
  `current_step_id` bigint unsigned DEFAULT NULL,
  `lead_id` bigint unsigned DEFAULT NULL,
  `campaign_id` bigint unsigned DEFAULT NULL,
  `last_inbound_at` datetime(3) DEFAULT NULL,
  `last_outbound_at` datetime(3) DEFAULT NULL,
  `context` json NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospecting_conversations_public_id_key` (`public_id`),
  UNIQUE KEY `uq_prospecting_conversation_contact_instance_status` (`contact_id`,`instance_id`,`status`),
  KEY `prospecting_conversations_instance_id_status_idx` (`instance_id`,`status`),
  KEY `prospecting_conversations_contact_id_status_idx` (`contact_id`,`status`),
  CONSTRAINT `prospecting_conversations_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `prospecting_contacts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_flow_executions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_flow_executions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `campaign_id` bigint unsigned NOT NULL,
  `lead_id` bigint unsigned NOT NULL,
  `flow_id` bigint unsigned NOT NULL,
  `current_step_id` bigint unsigned NOT NULL,
  `status` enum('ACTIVE','WAITING','MANUAL','COMPLETED','CANCELED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospecting_flow_executions_public_id_key` (`public_id`),
  UNIQUE KEY `prospecting_flow_executions_campaign_id_lead_id_flow_id_key` (`campaign_id`,`lead_id`,`flow_id`),
  KEY `prospecting_flow_executions_campaign_id_idx` (`campaign_id`),
  KEY `prospecting_flow_executions_lead_id_idx` (`lead_id`),
  KEY `prospecting_flow_executions_flow_id_idx` (`flow_id`),
  KEY `prospecting_flow_executions_status_idx` (`status`),
  KEY `prospecting_flow_executions_current_step_id_fkey` (`current_step_id`),
  CONSTRAINT `prospecting_flow_executions_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `prospecting_campaigns` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `prospecting_flow_executions_current_step_id_fkey` FOREIGN KEY (`current_step_id`) REFERENCES `prospecting_flow_steps` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `prospecting_flow_executions_flow_id_fkey` FOREIGN KEY (`flow_id`) REFERENCES `prospecting_flows` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `prospecting_flow_executions_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `prospecting_leads` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_flow_option_patterns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_flow_option_patterns` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `option_id` bigint unsigned NOT NULL,
  `pattern` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pattern_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` int NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `prospecting_flow_option_patterns_option_id_idx` (`option_id`),
  CONSTRAINT `prospecting_flow_option_patterns_option_id_fkey` FOREIGN KEY (`option_id`) REFERENCES `prospecting_flow_options` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_flow_options`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_flow_options` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `step_id` bigint unsigned NOT NULL,
  `label` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `next_step_id` bigint unsigned DEFAULT NULL,
  `action_type` enum('NEXT_STEP','END','MANUAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `position` int NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospecting_flow_options_public_id_key` (`public_id`),
  KEY `prospecting_flow_options_step_id_idx` (`step_id`),
  KEY `prospecting_flow_options_next_step_id_idx` (`next_step_id`),
  CONSTRAINT `prospecting_flow_options_next_step_id_fkey` FOREIGN KEY (`next_step_id`) REFERENCES `prospecting_flow_steps` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prospecting_flow_options_step_id_fkey` FOREIGN KEY (`step_id`) REFERENCES `prospecting_flow_steps` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_flow_responses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_flow_responses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `execution_id` bigint unsigned NOT NULL,
  `step_id` bigint unsigned NOT NULL,
  `inbound_message_id` bigint unsigned DEFAULT NULL,
  `response_text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `matched_option_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `prospecting_flow_responses_execution_id_idx` (`execution_id`),
  KEY `prospecting_flow_responses_step_id_idx` (`step_id`),
  KEY `prospecting_flow_responses_matched_option_id_fkey` (`matched_option_id`),
  CONSTRAINT `prospecting_flow_responses_execution_id_fkey` FOREIGN KEY (`execution_id`) REFERENCES `prospecting_flow_executions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `prospecting_flow_responses_matched_option_id_fkey` FOREIGN KEY (`matched_option_id`) REFERENCES `prospecting_flow_options` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prospecting_flow_responses_step_id_fkey` FOREIGN KEY (`step_id`) REFERENCES `prospecting_flow_steps` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_flow_steps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_flow_steps` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `flow_id` bigint unsigned NOT NULL,
  `name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `step_type` enum('MESSAGE_OPTIONS','WAIT_TEXT','WAIT_LINK','MESSAGE_ONLY','MANUAL','END') COLLATE utf8mb4_unicode_ci NOT NULL,
  `position` int NOT NULL,
  `next_step_id` bigint unsigned DEFAULT NULL,
  `is_start` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospecting_flow_steps_public_id_key` (`public_id`),
  UNIQUE KEY `prospecting_flow_steps_flow_id_code_key` (`flow_id`,`code`),
  KEY `prospecting_flow_steps_flow_id_idx` (`flow_id`),
  KEY `prospecting_flow_steps_next_step_id_idx` (`next_step_id`),
  KEY `prospecting_flow_steps_is_start_idx` (`is_start`),
  CONSTRAINT `prospecting_flow_steps_flow_id_fkey` FOREIGN KEY (`flow_id`) REFERENCES `prospecting_flows` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `prospecting_flow_steps_next_step_id_fkey` FOREIGN KEY (`next_step_id`) REFERENCES `prospecting_flow_steps` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_flows`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_flows` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `purpose` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CAMPAIGN',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospecting_flows_public_id_key` (`public_id`),
  UNIQUE KEY `prospecting_flows_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_leads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_leads` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `campaign_id` bigint unsigned NOT NULL,
  `directory_business_id` bigint unsigned NOT NULL,
  `phone_snapshot` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `normalized_phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_snapshot` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','SCHEDULED','CONTACTED','WAITING_REPLY','RESPONDED','QUALIFYING','INTERESTED','DEMO_SENT','FOLLOW_UP','WON','LOST','NO_RESPONSE','SUPPRESSED','FAILED','NEEDS_REVIEW') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `current_step` smallint unsigned NOT NULL DEFAULT '0',
  `next_action_at` datetime(3) DEFAULT NULL,
  `attempt_count` smallint unsigned NOT NULL DEFAULT '0',
  `follow_up_count` tinyint unsigned NOT NULL DEFAULT '0',
  `last_outbound_at` datetime(3) DEFAULT NULL,
  `last_inbound_at` datetime(3) DEFAULT NULL,
  `responded_at` datetime(3) DEFAULT NULL,
  `interested_at` datetime(3) DEFAULT NULL,
  `converted_at` datetime(3) DEFAULT NULL,
  `human_lock_started_at` datetime(3) DEFAULT NULL,
  `human_lock_until` datetime(3) DEFAULT NULL,
  `human_lock_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `human_lock_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `processing_worker_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `processing_started_at` datetime(3) DEFAULT NULL,
  `processing_expires_at` datetime(3) DEFAULT NULL,
  `suppressed_at` datetime(3) DEFAULT NULL,
  `suppression_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospecting_leads_public_id_key` (`public_id`),
  UNIQUE KEY `upld_campaign_business` (`campaign_id`,`directory_business_id`),
  KEY `prospecting_leads_campaign_id_status_next_action_at_idx` (`campaign_id`,`status`,`next_action_at`),
  KEY `prospecting_leads_normalized_phone_idx` (`normalized_phone`),
  KEY `prospecting_leads_human_lock_until_idx` (`human_lock_until`),
  KEY `prospecting_leads_directory_business_id_fkey` (`directory_business_id`),
  CONSTRAINT `prospecting_leads_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `prospecting_campaigns` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `prospecting_leads_directory_business_id_fkey` FOREIGN KEY (`directory_business_id`) REFERENCES `directory_businesses` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `campaign_id` bigint unsigned DEFAULT NULL,
  `lead_id` bigint unsigned DEFAULT NULL,
  `conversation_id` bigint unsigned DEFAULT NULL,
  `direction` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `step_number` smallint unsigned DEFAULT NULL,
  `template_id` bigint unsigned DEFAULT NULL,
  `variant_index` tinyint unsigned DEFAULT NULL,
  `idempotency_key` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `sending_started_at` datetime(3) DEFAULT NULL,
  `classified_at` datetime(3) DEFAULT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `external_message_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sent_at` datetime(3) DEFAULT NULL,
  `delivered_at` datetime(3) DEFAULT NULL,
  `read_at` datetime(3) DEFAULT NULL,
  `failed_at` datetime(3) DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `error_code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attempt_number` tinyint unsigned NOT NULL DEFAULT '1',
  `objection_id` bigint unsigned DEFAULT NULL,
  `purpose` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CAMPAIGN',
  `scheduled_at` datetime(3) DEFAULT NULL,
  `next_attempt_at` datetime(3) DEFAULT NULL,
  `reply_to_message_id` bigint unsigned DEFAULT NULL,
  `cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `option_ids` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospecting_messages_public_id_key` (`public_id`),
  UNIQUE KEY `uq_prospecting_message_idempotency_key` (`idempotency_key`),
  KEY `prospecting_messages_campaign_id_status_idx` (`campaign_id`,`status`),
  KEY `prospecting_messages_lead_id_direction_created_at_idx` (`lead_id`,`direction`,`created_at`),
  KEY `prospecting_messages_objection_id_classified_at_idx` (`objection_id`,`classified_at`),
  KEY `prospecting_messages_purpose_status_next_attempt_at_idx` (`purpose`,`status`,`next_attempt_at`),
  KEY `prospecting_messages_conversation_id_created_at_idx` (`conversation_id`,`created_at`),
  KEY `prospecting_messages_template_id_fkey` (`template_id`),
  KEY `prospecting_messages_reply_to_message_id_fkey` (`reply_to_message_id`),
  CONSTRAINT `prospecting_messages_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `prospecting_campaigns` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `prospecting_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `prospecting_conversations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prospecting_messages_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `prospecting_leads` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `prospecting_messages_objection_id_fkey` FOREIGN KEY (`objection_id`) REFERENCES `prospecting_objections` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prospecting_messages_reply_to_message_id_fkey` FOREIGN KEY (`reply_to_message_id`) REFERENCES `prospecting_messages` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prospecting_messages_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `prospecting_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_objection_exclusions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_objection_exclusions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `campaign_id` bigint unsigned NOT NULL,
  `objection_id` bigint unsigned NOT NULL,
  `exclude_follow_up` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `upoe_campaign_objection` (`campaign_id`,`objection_id`),
  KEY `prospecting_objection_exclusions_objection_id_fkey` (`objection_id`),
  CONSTRAINT `prospecting_objection_exclusions_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `prospecting_campaigns` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `prospecting_objection_exclusions_objection_id_fkey` FOREIGN KEY (`objection_id`) REFERENCES `prospecting_objections` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_objection_patterns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_objection_patterns` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `objection_id` bigint unsigned NOT NULL,
  `pattern_type` enum('EXACT','STARTS_WITH','ENDS_WITH','CONTAINS') COLLATE utf8mb4_unicode_ci NOT NULL,
  `pattern` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` int NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `prospecting_objection_patterns_objection_id_priority_idx` (`objection_id`,`priority`),
  CONSTRAINT `prospecting_objection_patterns_objection_id_fkey` FOREIGN KEY (`objection_id`) REFERENCES `prospecting_objections` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_objections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_objections` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `suggested_response` text COLLATE utf8mb4_unicode_ci,
  `auto_reply_allowed` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospecting_objections_public_id_key` (`public_id`),
  UNIQUE KEY `prospecting_objections_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_suppressions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_suppressions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `campaign_id` bigint unsigned NOT NULL,
  `normalized_phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `suppressed_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ups_campaign_phone` (`campaign_id`,`normalized_phone`),
  KEY `prospecting_suppressions_campaign_id_normalized_phone_idx` (`campaign_id`,`normalized_phone`),
  CONSTRAINT `prospecting_suppressions_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `prospecting_campaigns` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_template_variants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_template_variants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `template_id` bigint unsigned NOT NULL,
  `variant_index` tinyint unsigned NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uptv_template_variant` (`template_id`,`variant_index`),
  CONSTRAINT `prospecting_template_variants_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `prospecting_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_templates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `campaign_id` bigint unsigned NOT NULL,
  `step_number` smallint unsigned NOT NULL,
  `name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'TEXT',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospecting_templates_public_id_key` (`public_id`),
  KEY `prospecting_templates_campaign_id_step_number_idx` (`campaign_id`,`step_number`),
  CONSTRAINT `prospecting_templates_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `prospecting_campaigns` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prospecting_whatsapp_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prospecting_whatsapp_configs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `instance_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token_ciphertext` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `instance_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `last_connection_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_checked_at` datetime(3) DEFAULT NULL,
  `next_send_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `attendant_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `attendant_flow_id` bigint unsigned DEFAULT NULL,
  `greeting_message` text COLLATE utf8mb4_unicode_ci,
  `fallback_message` text COLLATE utf8mb4_unicode_ci,
  `media_fallback_message` text COLLATE utf8mb4_unicode_ci,
  `realtime_replies_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `use_contact_name` tinyint(1) NOT NULL DEFAULT '1',
  `invalid_message` text COLLATE utf8mb4_unicode_ci,
  `human_transfer_message` text COLLATE utf8mb4_unicode_ci,
  `business_hours_start` smallint unsigned DEFAULT NULL,
  `business_hours_end` smallint unsigned DEFAULT NULL,
  `outside_hours_message` text COLLATE utf8mb4_unicode_ci,
  `reply_delay_seconds` int unsigned NOT NULL DEFAULT '0',
  `attendant_session_timeout_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `attendant_session_timeout_minutes` int unsigned NOT NULL DEFAULT '60',
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospecting_whatsapp_configs_public_id_key` (`public_id`),
  UNIQUE KEY `prospecting_whatsapp_configs_instance_id_key` (`instance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `push_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `push_subscriptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `endpoint` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `endpoint_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `p256dh` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `auth` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `last_used_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `push_subscriptions_public_id_key` (`public_id`),
  UNIQUE KEY `push_subscriptions_endpoint_hash_key` (`endpoint_hash`),
  KEY `push_subscriptions_tenant_id_customer_id_idx` (`tenant_id`,`customer_id`),
  KEY `push_subscriptions_tenant_id_active_idx` (`tenant_id`,`active`),
  KEY `push_subscriptions_customer_id_fkey` (`customer_id`),
  CONSTRAINT `push_subscriptions_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `push_subscriptions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `receipts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `payment_id` bigint unsigned NOT NULL,
  `number` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issued_by_user_id` bigint unsigned DEFAULT NULL,
  `issued_by_session_id` bigint unsigned DEFAULT NULL,
  `issued_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `receipts_public_id_key` (`public_id`),
  UNIQUE KEY `receipts_payment_id_key` (`payment_id`),
  UNIQUE KEY `receipts_tenant_id_number_key` (`tenant_id`,`number`),
  KEY `receipts_issued_by_user_id_fkey` (`issued_by_user_id`),
  KEY `receipts_issued_by_session_id_fkey` (`issued_by_session_id`),
  CONSTRAINT `receipts_issued_by_session_id_fkey` FOREIGN KEY (`issued_by_session_id`) REFERENCES `user_sessions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `receipts_issued_by_user_id_fkey` FOREIGN KEY (`issued_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `receipts_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `receipts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_permissions` (
  `role_id` bigint unsigned NOT NULL,
  `permission_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `role_permissions_permission_id_idx` (`permission_id`),
  CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned DEFAULT NULL,
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `roles_public_id_key` (`public_id`),
  UNIQUE KEY `roles_code_key` (`code`),
  KEY `roles_tenant_id_idx` (`tenant_id`),
  CONSTRAINT `roles_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `seo_url_inspections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `seo_url_inspections` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` varchar(700) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` bigint unsigned DEFAULT NULL,
  `status` enum('PENDING','PROCESSING','DONE','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `priority` int NOT NULL DEFAULT '0',
  `attempts` int NOT NULL DEFAULT '0',
  `last_error` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verdict` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `coverage_state` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `google_canonical` varchar(700) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_crawl_at` datetime(3) DEFAULT NULL,
  `last_attempt_at` datetime(3) DEFAULT NULL,
  `processed_at` datetime(3) DEFAULT NULL,
  `next_attempt_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `seo_url_inspections_public_id_key` (`public_id`),
  UNIQUE KEY `seo_url_inspections_url_key` (`url`),
  KEY `seo_url_inspections_status_priority_next_attempt_at_idx` (`status`,`priority`,`next_attempt_at`),
  KEY `seo_url_inspections_business_id_idx` (`business_id`),
  CONSTRAINT `seo_url_inspections_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `directory_businesses` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `seo_url_submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `seo_url_submissions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` varchar(700) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider` enum('INDEXNOW') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` enum('CREATED','UPDATED','DELETED','MANUAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','PROCESSING','DONE','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `business_id` bigint unsigned DEFAULT NULL,
  `attempts` int NOT NULL DEFAULT '0',
  `last_error` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `response_status` int DEFAULT NULL,
  `last_attempt_at` datetime(3) DEFAULT NULL,
  `processed_at` datetime(3) DEFAULT NULL,
  `next_attempt_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `seo_url_submissions_public_id_key` (`public_id`),
  UNIQUE KEY `usu_provider_url` (`provider`,`url`),
  KEY `seo_url_submissions_status_next_attempt_at_idx` (`status`,`next_attempt_at`),
  KEY `seo_url_submissions_business_id_idx` (`business_id`),
  CONSTRAINT `seo_url_submissions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `directory_businesses` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `service_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `service_categories` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `service_categories_public_id_key` (`public_id`),
  UNIQUE KEY `service_categories_tenant_id_name_key` (`tenant_id`,`name`),
  KEY `service_categories_tenant_id_active_sort_order_idx` (`tenant_id`,`active`,`sort_order`),
  CONSTRAINT `service_categories_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `service_variations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `service_variations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `service_id` bigint unsigned NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `duration_minutes` smallint unsigned NOT NULL,
  `price_cents` bigint unsigned NOT NULL DEFAULT '0',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `service_variations_public_id_key` (`public_id`),
  UNIQUE KEY `service_variations_service_id_name_key` (`service_id`,`name`),
  KEY `service_variations_tenant_id_service_id_active_sort_order_idx` (`tenant_id`,`service_id`,`active`,`sort_order`),
  CONSTRAINT `service_variations_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `service_variations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `services`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `services` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `category_id` bigint unsigned DEFAULT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_path` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_alt` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `icon_key` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration_minutes` smallint unsigned NOT NULL,
  `has_post_service_break` tinyint(1) NOT NULL DEFAULT '0',
  `post_service_break_minutes` smallint unsigned NOT NULL DEFAULT '0',
  `price_cents` bigint unsigned NOT NULL DEFAULT '0',
  `pricing_mode` enum('FIXED','QUOTE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'FIXED',
  `quote_notice` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `services_public_id_key` (`public_id`),
  UNIQUE KEY `services_tenant_id_name_key` (`tenant_id`,`name`),
  KEY `services_tenant_id_active_sort_order_idx` (`tenant_id`,`active`,`sort_order`),
  KEY `services_tenant_id_category_id_idx` (`tenant_id`,`category_id`),
  KEY `services_category_id_fkey` (`category_id`),
  CONSTRAINT `services_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `service_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `services_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stock_movements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_movements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `transfer_public_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  `business_unit_id` bigint unsigned NOT NULL,
  `related_business_unit_id` bigint unsigned DEFAULT NULL,
  `type` enum('ENTRY','MANUAL_EXIT','POSITIVE_ADJUSTMENT','NEGATIVE_ADJUSTMENT','TRANSFER_OUT','TRANSFER_IN') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int unsigned NOT NULL,
  `previous_quantity` int unsigned NOT NULL,
  `resulting_quantity` int unsigned NOT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `performed_by_user_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_movements_public_id_key` (`public_id`),
  KEY `stock_movements_tenant_id_created_at_idx` (`tenant_id`,`created_at`),
  KEY `stock_movements_tenant_product_unit_created_idx` (`tenant_id`,`product_id`,`business_unit_id`,`created_at`),
  KEY `stock_movements_transfer_public_id_idx` (`transfer_public_id`),
  KEY `stock_movements_performed_by_user_id_created_at_idx` (`performed_by_user_id`,`created_at`),
  KEY `stock_movements_product_id_fkey` (`product_id`),
  KEY `stock_movements_business_unit_id_fkey` (`business_unit_id`),
  KEY `stock_movements_related_business_unit_id_fkey` (`related_business_unit_id`),
  CONSTRAINT `stock_movements_business_unit_id_fkey` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `stock_movements_performed_by_user_id_fkey` FOREIGN KEY (`performed_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `stock_movements_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `stock_movements_related_business_unit_id_fkey` FOREIGN KEY (`related_business_unit_id`) REFERENCES `business_units` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `stock_movements_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stripe_plan_catalogs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stripe_plan_catalogs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_id` bigint unsigned NOT NULL,
  `environment` enum('SANDBOX','PRODUCTION') COLLATE utf8mb4_unicode_ci NOT NULL,
  `stripe_product_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `last_error` text COLLATE utf8mb4_unicode_ci,
  `last_synced_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `stripe_plan_catalogs_public_id_key` (`public_id`),
  UNIQUE KEY `stripe_plan_catalogs_plan_id_environment_key` (`plan_id`,`environment`),
  UNIQUE KEY `stripe_plan_catalogs_environment_stripe_product_id_key` (`environment`,`stripe_product_id`),
  KEY `stripe_plan_catalogs_status_environment_idx` (`status`,`environment`),
  CONSTRAINT `stripe_plan_catalogs_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `commercial_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stripe_plan_prices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stripe_plan_prices` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `catalog_id` bigint unsigned NOT NULL,
  `billing_option_id` bigint unsigned NOT NULL,
  `stripe_price_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SYNCED',
  `amount_cents` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `stripe_plan_prices_public_id_key` (`public_id`),
  UNIQUE KEY `stripe_plan_prices_catalog_id_billing_option_id_key` (`catalog_id`,`billing_option_id`),
  UNIQUE KEY `stripe_plan_prices_stripe_price_id_key` (`stripe_price_id`),
  KEY `stripe_plan_prices_billing_option_id_status_idx` (`billing_option_id`,`status`),
  CONSTRAINT `stripe_plan_prices_billing_option_id_fkey` FOREIGN KEY (`billing_option_id`) REFERENCES `plan_billing_options` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `stripe_plan_prices_catalog_id_fkey` FOREIGN KEY (`catalog_id`) REFERENCES `stripe_plan_catalogs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stripe_webhook_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stripe_webhook_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `external_event_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_type` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `processing_status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'RECEIVED',
  `received_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processed_at` datetime(3) DEFAULT NULL,
  `last_error` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stripe_webhook_events_external_event_id_key` (`external_event_id`),
  KEY `stripe_webhook_events_processing_status_received_at_idx` (`processing_status`,`received_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `subscription_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscription_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subscription_id` bigint unsigned NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `action` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `previous_status` enum('TRIALING','ACTIVE','PAST_DUE','SUSPENDED','CANCELED','EXPIRED') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_status` enum('TRIALING','ACTIVE','PAST_DUE','SUSPENDED','CANCELED','EXPIRED') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `previous_plan_id` bigint unsigned DEFAULT NULL,
  `new_plan_id` bigint unsigned DEFAULT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `performed_by_user_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `subscription_history_public_id_key` (`public_id`),
  KEY `subscription_history_tenant_id_created_at_idx` (`tenant_id`,`created_at`),
  KEY `subscription_history_subscription_id_created_at_idx` (`subscription_id`,`created_at`),
  KEY `subscription_history_action_created_at_idx` (`action`,`created_at`),
  KEY `subscription_history_performed_by_user_id_fkey` (`performed_by_user_id`),
  CONSTRAINT `subscription_history_performed_by_user_id_fkey` FOREIGN KEY (`performed_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `subscription_history_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `subscription_history_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `subscription_plan_changes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscription_plan_changes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `subscription_id` bigint unsigned NOT NULL,
  `current_plan_id` bigint unsigned NOT NULL,
  `target_plan_id` bigint unsigned NOT NULL,
  `current_billing_cycle` enum('MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL','CUSTOM') COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_billing_cycle` enum('MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL','CUSTOM') COLLATE utf8mb4_unicode_ci NOT NULL,
  `current_period_starts_at` datetime(3) NOT NULL,
  `current_period_ends_at` datetime(3) NOT NULL,
  `source_paid_amount_cents` bigint unsigned NOT NULL,
  `unused_credit_cents` bigint unsigned NOT NULL,
  `target_price_cents` bigint unsigned NOT NULL,
  `amount_due_cents` bigint unsigned NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING_PAYMENT','SCHEDULED','PAID','APPLIED','CANCELED','EXPIRED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING_PAYMENT',
  `requested_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `payment_provider` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_reference` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stripe_checkout_session_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stripe_payment_intent_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stripe_subscription_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expires_at` datetime(3) NOT NULL,
  `paid_at` datetime(3) DEFAULT NULL,
  `applied_at` datetime(3) DEFAULT NULL,
  `effective_at` datetime(3) DEFAULT NULL,
  `failure_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `subscription_plan_changes_public_id_key` (`public_id`),
  KEY `subscription_plan_changes_tenant_id_status_idx` (`tenant_id`,`status`),
  KEY `subscription_plan_changes_subscription_id_status_idx` (`subscription_id`,`status`),
  KEY `subscription_plan_changes_expires_at_status_idx` (`expires_at`,`status`),
  KEY `subscription_plan_changes_current_plan_id_fkey` (`current_plan_id`),
  KEY `subscription_plan_changes_target_plan_id_fkey` (`target_plan_id`),
  CONSTRAINT `subscription_plan_changes_current_plan_id_fkey` FOREIGN KEY (`current_plan_id`) REFERENCES `commercial_plans` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `subscription_plan_changes_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `subscription_plan_changes_target_plan_id_fkey` FOREIGN KEY (`target_plan_id`) REFERENCES `commercial_plans` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `subscription_plan_changes_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `system_metadata`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_metadata` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `application_version` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `database_initialized_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_automations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_automations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `trigger` enum('APPOINTMENT_REMINDER','POST_APPOINTMENT','INACTIVE_CUSTOMER','CUSTOMER_BIRTHDAY') COLLATE utf8mb4_unicode_ci NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `offset_minutes` int NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_automations_public_id_key` (`public_id`),
  UNIQUE KEY `tenant_automations_tenant_id_trigger_key` (`tenant_id`,`trigger`),
  KEY `tenant_automations_tenant_id_active_idx` (`tenant_id`,`active`),
  CONSTRAINT `tenant_automations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_branding`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_branding` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `use_profile_defaults` tinyint(1) NOT NULL DEFAULT '1',
  `primary_color` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `secondary_color` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `accent_color` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `background_color` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `surface_color` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `text_color` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `muted_text_color` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `border_color` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `border_radius` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `font_family` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `on_primary_color` char(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `header_color` char(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `header_text_color` char(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `navigation_color` char(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active_color` char(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `logo_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `favicon_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `banner_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pwa_icon_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `splash_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_branding_tenant_id_key` (`tenant_id`),
  CONSTRAINT `tenant_branding_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_commercial_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_commercial_assignments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `manager_id` bigint unsigned DEFAULT NULL,
  `representative_id` bigint unsigned DEFAULT NULL,
  `seller_id` bigint unsigned DEFAULT NULL,
  `source` enum('REGION_AUTO','CREATED_BY_MANAGER','CREATED_BY_REPRESENTATIVE','CREATED_BY_SELLER','GLOBAL_ADMIN','MANUAL_OVERRIDE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'REGION_AUTO',
  `assigned_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `assigned_by_user_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_commercial_assignments_tenant_id_key` (`tenant_id`),
  KEY `tenant_commercial_assignments_tenant_id_idx` (`tenant_id`),
  KEY `tenant_commercial_assignments_manager_id_idx` (`manager_id`),
  KEY `tenant_commercial_assignments_representative_id_idx` (`representative_id`),
  KEY `tenant_commercial_assignments_seller_id_idx` (`seller_id`),
  KEY `tenant_commercial_assignments_assigned_by_user_id_fkey` (`assigned_by_user_id`),
  CONSTRAINT `tenant_commercial_assignments_assigned_by_user_id_fkey` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `tenant_commercial_assignments_manager_id_fkey` FOREIGN KEY (`manager_id`) REFERENCES `commercial_accounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `tenant_commercial_assignments_representative_id_fkey` FOREIGN KEY (`representative_id`) REFERENCES `commercial_accounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `tenant_commercial_assignments_seller_id_fkey` FOREIGN KEY (`seller_id`) REFERENCES `commercial_accounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `tenant_commercial_assignments_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_commercial_policies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_commercial_policies` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `singleton` tinyint(1) NOT NULL DEFAULT '1',
  `default_trial_days` smallint unsigned NOT NULL DEFAULT '7',
  `grace_days` smallint unsigned NOT NULL DEFAULT '7',
  `auto_suspend_after_grace` tinyint(1) NOT NULL DEFAULT '1',
  `allow_admin_login_while_blocked` tinyint(1) NOT NULL DEFAULT '1',
  `allow_calendar_read_while_blocked` tinyint(1) NOT NULL DEFAULT '1',
  `allow_admin_changes_while_blocked` tinyint(1) NOT NULL DEFAULT '0',
  `allow_internal_booking_while_blocked` tinyint(1) NOT NULL DEFAULT '0',
  `allow_public_booking_while_blocked` tinyint(1) NOT NULL DEFAULT '0',
  `public_site_behavior_while_blocked` enum('NORMAL','HIDE_BOOKING','OFFLINE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'HIDE_BOOKING',
  `admin_message` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `public_message` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `commercial_whatsapp` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_commercial_policies_public_id_key` (`public_id`),
  UNIQUE KEY `tenant_commercial_policies_singleton_key` (`singleton`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_custom_field_definitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_custom_field_definitions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `key` varchar(63) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` enum('TEXT','TEXTAREA','NUMBER','BOOLEAN','DATE','SELECT','MULTISELECT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `scope` enum('TENANT','PROFESSIONAL','CUSTOMER','APPOINTMENT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `required` tinyint(1) NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `options` json DEFAULT NULL,
  `validation` json DEFAULT NULL,
  `source` enum('PROFILE','OVERRIDE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OVERRIDE',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_custom_field_definitions_public_id_key` (`public_id`),
  UNIQUE KEY `tenant_custom_field_definitions_tenant_id_scope_key_key` (`tenant_id`,`scope`,`key`),
  KEY `tenant_custom_field_definitions_tenant_id_scope_active_sort__idx` (`tenant_id`,`scope`,`active`,`sort_order`),
  CONSTRAINT `tenant_custom_field_definitions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_domains`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_domains` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `hostname` varchar(253) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('CUSTOM','SUBDOMAIN') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','ACTIVE','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `verification_token` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `verified_at` datetime(3) DEFAULT NULL,
  `last_error` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_domains_public_id_key` (`public_id`),
  UNIQUE KEY `tenant_domains_hostname_key` (`hostname`),
  KEY `tenant_domains_tenant_id_status_idx` (`tenant_id`,`status`),
  CONSTRAINT `tenant_domains_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_feature_overrides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_feature_overrides` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `feature_code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `enabled` tinyint(1) NOT NULL,
  `source` enum('PROFILE','OVERRIDE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OVERRIDE',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_feature_overrides_tenant_id_feature_code_key` (`tenant_id`,`feature_code`),
  KEY `tenant_feature_overrides_tenant_id_source_idx` (`tenant_id`,`source`),
  CONSTRAINT `tenant_feature_overrides_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_media_assets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_media_assets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `kind` enum('LOGO','LOGO_COMPACT','FAVICON','APP_ICON','SPLASH','BANNER_DESKTOP','BANNER_MOBILE','INSTITUTIONAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `storage_key` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mime_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `byte_size` int unsigned NOT NULL,
  `alt_text` varchar(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_media_assets_public_id_key` (`public_id`),
  UNIQUE KEY `tenant_media_assets_storage_key_key` (`storage_key`),
  KEY `tenant_media_assets_tenant_id_kind_deleted_at_idx` (`tenant_id`,`kind`,`deleted_at`),
  CONSTRAINT `tenant_media_assets_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_membership_units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_membership_units` (
  `membership_id` bigint unsigned NOT NULL,
  `unit_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`membership_id`,`unit_id`),
  KEY `tenant_membership_units_unit_id_idx` (`unit_id`),
  CONSTRAINT `tenant_membership_units_membership_id_fkey` FOREIGN KEY (`membership_id`) REFERENCES `tenant_memberships` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `tenant_membership_units_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `business_units` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_memberships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_memberships` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `role_id` bigint unsigned NOT NULL,
  `status` enum('ACTIVE','INVITED','SUSPENDED','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'INVITED',
  `is_owner` tinyint(1) NOT NULL DEFAULT '0',
  `all_units` tinyint(1) NOT NULL DEFAULT '1',
  `joined_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_memberships_public_id_key` (`public_id`),
  UNIQUE KEY `tenant_memberships_tenant_id_user_id_key` (`tenant_id`,`user_id`),
  KEY `tenant_memberships_user_id_status_idx` (`user_id`,`status`),
  KEY `tenant_memberships_tenant_id_status_idx` (`tenant_id`,`status`),
  KEY `tenant_memberships_role_id_idx` (`role_id`),
  CONSTRAINT `tenant_memberships_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `tenant_memberships_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `tenant_memberships_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_public_sites`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_public_sites` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `theme` enum('CLASSIC','MODERN','PREMIUM','LUXURY') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CLASSIC',
  `layout` enum('CLASSIC','PREMIUM_APP') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CLASSIC',
  `hero_title` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hero_subtitle` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `about_text` varchar(4000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `primary_call_to_action` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `footer_text` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `seo_title` varchar(70) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `seo_description` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pwa_name` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pwa_short_name` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pwa_description` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pwa_status` enum('DRAFT','PUBLISHED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `pwa_published_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_public_sites_tenant_id_key` (`tenant_id`),
  CONSTRAINT `tenant_public_sites_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_settings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `allow_multiple_units` tinyint(1) NOT NULL DEFAULT '0',
  `default_appointment_interval_minutes` smallint unsigned NOT NULL DEFAULT '15',
  `minimum_advance_minutes` smallint unsigned NOT NULL DEFAULT '0',
  `maximum_advance_days` smallint unsigned NOT NULL DEFAULT '180',
  `week_starts_on` enum('SUNDAY','MONDAY') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MONDAY',
  `date_format` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DD/MM/YYYY',
  `time_format` enum('24H','12H') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '24H',
  `pay_local_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_settings_tenant_id_key` (`tenant_id`),
  CONSTRAINT `tenant_settings_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_subscriptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `plan_id` bigint unsigned NOT NULL,
  `status` enum('TRIALING','ACTIVE','PAST_DUE','SUSPENDED','CANCELED','EXPIRED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `starts_at` datetime(3) NOT NULL,
  `trial_started_at` datetime(3) DEFAULT NULL,
  `trial_ends_at` datetime(3) DEFAULT NULL,
  `grace_ends_at` datetime(3) DEFAULT NULL,
  `current_period_starts_at` datetime(3) NOT NULL,
  `current_period_ends_at` datetime(3) NOT NULL,
  `canceled_at` datetime(3) DEFAULT NULL,
  `suspended_at` datetime(3) DEFAULT NULL,
  `ends_at` datetime(3) DEFAULT NULL,
  `price_cents` bigint unsigned NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `billing_cycle` enum('MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL','CUSTOM') COLLATE utf8mb4_unicode_ci NOT NULL,
  `effective_key` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scheduled_plan_id` bigint unsigned DEFAULT NULL,
  `scheduled_billing_cycle` enum('MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL','CUSTOM') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scheduled_effective_at` datetime(3) DEFAULT NULL,
  `billing_provider` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stripe_customer_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stripe_subscription_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stripe_price_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cancel_at_period_end` tinyint(1) NOT NULL DEFAULT '0',
  `last_payment_at` datetime(3) DEFAULT NULL,
  `last_stripe_event_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_subscriptions_public_id_key` (`public_id`),
  UNIQUE KEY `tenant_subscriptions_stripe_subscription_id_key` (`stripe_subscription_id`),
  UNIQUE KEY `tenant_subscriptions_tenant_id_effective_key_key` (`tenant_id`,`effective_key`),
  KEY `tenant_subscriptions_status_current_period_ends_at_idx` (`status`,`current_period_ends_at`),
  KEY `tenant_subscriptions_plan_id_status_idx` (`plan_id`,`status`),
  KEY `tenant_subscriptions_scheduled_plan_id_fkey` (`scheduled_plan_id`),
  CONSTRAINT `tenant_subscriptions_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `commercial_plans` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `tenant_subscriptions_scheduled_plan_id_fkey` FOREIGN KEY (`scheduled_plan_id`) REFERENCES `commercial_plans` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `tenant_subscriptions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_terminology`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_terminology` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `professional_singular` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `professional_plural` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_singular` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_plural` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `service_singular` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `service_plural` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `appointment_singular` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `appointment_plural` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_singular` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_plural` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `treatment_plan_module_title` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `treatment_plan_singular` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `treatment_plan_plural` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `treatment_plan_session_singular` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `treatment_plan_session_plural` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_terminology_tenant_id_key` (`tenant_id`),
  CONSTRAINT `tenant_terminology_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_whatsapp_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_whatsapp_configs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '0',
  `provider` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'WAPI',
  `phone_number_id` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `instance_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `connection_status` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NOT_CREATED',
  `connected_phone` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `connected_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `connected_at` datetime(3) DEFAULT NULL,
  `last_status_check_at` datetime(3) DEFAULT NULL,
  `business_account_id` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `encrypted_access_token` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `encrypted_app_secret` text COLLATE utf8mb4_unicode_ci,
  `encrypted_verify_token` text COLLATE utf8mb4_unicode_ci,
  `webhook_public_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `api_version` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'v23.0',
  `last_validation_status` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_validated_at` datetime(3) DEFAULT NULL,
  `assistant_config` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_whatsapp_configs_public_id_key` (`public_id`),
  UNIQUE KEY `tenant_whatsapp_configs_tenant_provider_key` (`tenant_id`,`provider`),
  UNIQUE KEY `tenant_whatsapp_configs_provider_external_id_key` (`provider`,`phone_number_id`),
  UNIQUE KEY `tenant_whatsapp_configs_webhook_public_id_key` (`webhook_public_id`),
  KEY `tenant_whatsapp_configs_provider_idx` (`provider`),
  CONSTRAINT `tenant_whatsapp_configs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_whatsapp_meta_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_whatsapp_meta_templates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `whatsapp_config_id` bigint unsigned NOT NULL,
  `purpose` varchar(48) COLLATE utf8mb4_unicode_ci NOT NULL,
  `template_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `language` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `meta_template_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'UNKNOWN',
  `rejection_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_checked_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_whatsapp_meta_templates_public_id_key` (`public_id`),
  UNIQUE KEY `tenant_meta_template_unique` (`tenant_id`,`purpose`,`template_name`),
  KEY `tenant_meta_template_status_idx` (`tenant_id`,`status`),
  KEY `tenant_meta_template_config_idx` (`whatsapp_config_id`),
  CONSTRAINT `tenant_whatsapp_meta_templates_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `tenant_whatsapp_meta_templates_whatsapp_config_id_fkey` FOREIGN KEY (`whatsapp_config_id`) REFERENCES `tenant_whatsapp_configs` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_whatsapp_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_whatsapp_settings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `selected_provider` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'WAPI',
  `assistant_config` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_whatsapp_settings_public_id_key` (`public_id`),
  UNIQUE KEY `tenant_whatsapp_settings_tenant_id_key` (`tenant_id`),
  KEY `tenant_whatsapp_settings_selected_provider_idx` (`selected_provider`),
  CONSTRAINT `tenant_whatsapp_settings_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(63) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug_changed_at` datetime(3) DEFAULT NULL,
  `legal_name` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ACTIVE','SUSPENDED','INACTIVE','PENDING') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `timezone` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locale` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `operating_model` enum('SERVICE_PRICING','MEMBERSHIP') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SERVICE_PRICING',
  `business_profile` enum('BARBERSHOP','BEAUTY_SALON','AESTHETIC_CLINIC','MEDICAL_CLINIC','PSYCHOLOGY','NUTRITION','DENTISTRY','STUDIO','TATTOO_STUDIO','PET_CARE','SPA','MASSAGE','PERSONAL_TRAINER','CONSULTING','GENERIC') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'GENERIC',
  `business_type_custom` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `onboarding_step` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'WELCOME',
  `onboarding_completed_at` datetime(3) DEFAULT NULL,
  `onboarding_checklist_hidden_at` datetime(3) DEFAULT NULL,
  `starter_content_seeded_at` datetime(3) DEFAULT NULL,
  `starter_content_ids` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenants_public_id_key` (`public_id`),
  UNIQUE KEY `tenants_slug_key` (`slug`),
  KEY `tenants_status_idx` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `treatment_plan_reminder_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `treatment_plan_reminder_config` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `channel` enum('WHATSAPP','EMAIL','PUSH') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'WHATSAPP',
  `sequence` json NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `treatment_plan_reminder_config_tenant_id_key` (`tenant_id`),
  CONSTRAINT `treatment_plan_reminder_config_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `treatment_plan_reminder_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `treatment_plan_reminder_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `reminder_state_id` bigint unsigned NOT NULL,
  `step_index` smallint unsigned NOT NULL,
  `channel` enum('WHATSAPP','EMAIL','PUSH') COLLATE utf8mb4_unicode_ci NOT NULL,
  `sent_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `message_template` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sent_message` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `error_message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `treatment_plan_reminder_logs_tenant_id_idx` (`tenant_id`),
  KEY `treatment_plan_reminder_logs_reminder_state_id_idx` (`reminder_state_id`),
  CONSTRAINT `treatment_plan_reminder_logs_reminder_state_id_fkey` FOREIGN KEY (`reminder_state_id`) REFERENCES `treatment_plan_reminder_states` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `treatment_plan_reminder_logs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `treatment_plan_reminder_states`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `treatment_plan_reminder_states` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `treatment_plan_id` bigint unsigned NOT NULL,
  `next_reminder_at` datetime(3) DEFAULT NULL,
  `last_reminder_at` datetime(3) DEFAULT NULL,
  `reminders_sent` smallint unsigned NOT NULL DEFAULT '0',
  `status` enum('ACTIVE','PAUSED','COMPLETED','CANCELED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `channel` enum('WHATSAPP','EMAIL','PUSH') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'WHATSAPP',
  `current_step_index` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `treatment_plan_reminder_states_treatment_plan_id_key` (`treatment_plan_id`),
  KEY `treatment_plan_reminder_states_tenant_id_status_idx` (`tenant_id`,`status`),
  KEY `treatment_plan_reminder_states_next_reminder_at_status_idx` (`next_reminder_at`,`status`),
  CONSTRAINT `treatment_plan_reminder_states_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `treatment_plan_reminder_states_treatment_plan_id_fkey` FOREIGN KEY (`treatment_plan_id`) REFERENCES `treatment_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `treatment_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `treatment_plans` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `service_id` bigint unsigned NOT NULL,
  `professional_id` bigint unsigned NOT NULL,
  `origin_appointment_id` bigint unsigned NOT NULL,
  `title` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('PENDING','APPROVED','IN_PROGRESS','COMPLETED','CANCELED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `billing_mode` enum('TOTAL','PER_SESSION') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount_cents` bigint unsigned NOT NULL,
  `sessions_planned` smallint unsigned DEFAULT NULL,
  `return_interval_days` smallint unsigned DEFAULT NULL,
  `notes` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approved_at` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `canceled_at` datetime(3) DEFAULT NULL,
  `canceled_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `treatment_plans_public_id_key` (`public_id`),
  UNIQUE KEY `treatment_plans_origin_appointment_id_key` (`origin_appointment_id`),
  KEY `treatment_plans_tenant_id_customer_id_status_idx` (`tenant_id`,`customer_id`,`status`),
  KEY `treatment_plans_tenant_id_professional_id_status_idx` (`tenant_id`,`professional_id`,`status`),
  KEY `treatment_plans_customer_id_fkey` (`customer_id`),
  KEY `treatment_plans_service_id_fkey` (`service_id`),
  KEY `treatment_plans_professional_id_fkey` (`professional_id`),
  CONSTRAINT `treatment_plans_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `treatment_plans_origin_appointment_id_fkey` FOREIGN KEY (`origin_appointment_id`) REFERENCES `appointments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `treatment_plans_professional_id_fkey` FOREIGN KEY (`professional_id`) REFERENCES `professionals` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `treatment_plans_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `treatment_plans_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_invitations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_invitations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `normalized_email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_id` bigint unsigned NOT NULL,
  `token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','ACCEPTED','EXPIRED','REVOKED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `expires_at` datetime(3) NOT NULL,
  `accepted_at` datetime(3) DEFAULT NULL,
  `invited_by_user_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_invitations_public_id_key` (`public_id`),
  UNIQUE KEY `user_invitations_token_hash_key` (`token_hash`),
  KEY `user_invitations_tenant_id_status_expires_at_idx` (`tenant_id`,`status`,`expires_at`),
  KEY `user_invitations_normalized_email_status_idx` (`normalized_email`,`status`),
  KEY `user_invitations_role_id_idx` (`role_id`),
  KEY `user_invitations_invited_by_user_id_idx` (`invited_by_user_id`),
  CONSTRAINT `user_invitations_invited_by_user_id_fkey` FOREIGN KEY (`invited_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `user_invitations_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `user_invitations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_sessions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `last_seen_at` datetime(3) NOT NULL,
  `revoked_at` datetime(3) DEFAULT NULL,
  `revocation_reason` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_sessions_public_id_key` (`public_id`),
  UNIQUE KEY `user_sessions_token_hash_key` (`token_hash`),
  KEY `user_sessions_user_id_revoked_at_expires_at_idx` (`user_id`,`revoked_at`,`expires_at`),
  KEY `user_sessions_expires_at_idx` (`expires_at`),
  CONSTRAINT `user_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `normalized_email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `google_sub` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','INVITED','SUSPENDED','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'INVITED',
  `email_verified_at` datetime(3) DEFAULT NULL,
  `last_login_at` datetime(3) DEFAULT NULL,
  `password_changed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_public_id_key` (`public_id`),
  UNIQUE KEY `users_normalized_email_key` (`normalized_email`),
  UNIQUE KEY `users_google_sub_key` (`google_sub`),
  KEY `users_status_idx` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=53 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `wapi_remote_identity_mappings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wapi_remote_identity_mappings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `instance_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `remote_lid` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `normalized_phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wapi_remote_identity_instance_lid` (`instance_id`,`remote_lid`),
  KEY `idx_wapi_remote_identity_phone` (`normalized_phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `whatsapp_conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `whatsapp_conversations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned DEFAULT NULL,
  `phone` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `current_flow` varchar(48) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MAIN_MENU',
  `current_step` varchar(48) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `context` json DEFAULT NULL,
  `last_inbound_at` datetime(3) NOT NULL,
  `last_outbound_at` datetime(3) DEFAULT NULL,
  `expires_at` datetime(3) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `whatsapp_conversations_public_id_key` (`public_id`),
  KEY `whatsapp_conversations_tenant_id_phone_status_idx` (`tenant_id`,`phone`,`status`),
  KEY `whatsapp_conversations_tenant_id_last_inbound_at_idx` (`tenant_id`,`last_inbound_at`),
  KEY `whatsapp_conversations_customer_id_fkey` (`customer_id`),
  CONSTRAINT `whatsapp_conversations_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `whatsapp_conversations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `whatsapp_inbound_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `whatsapp_inbound_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `instance_id` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `external_message_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `event_type` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message_type` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fingerprint` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `text` text COLLATE utf8mb4_unicode_ci,
  `referenced_message_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_id` bigint unsigned DEFAULT NULL,
  `payload` json NOT NULL,
  `received_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `provider` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'WAPI',
  PRIMARY KEY (`id`),
  UNIQUE KEY `whatsapp_inbound_events_public_id_key` (`public_id`),
  UNIQUE KEY `whatsapp_inbound_events_fingerprint_key` (`tenant_id`,`fingerprint`),
  UNIQUE KEY `whatsapp_inbound_events_provider_event_key` (`tenant_id`,`provider`,`instance_id`,`external_message_id`,`event_type`),
  KEY `whatsapp_inbound_events_tenant_id_received_at_idx` (`tenant_id`,`received_at`),
  KEY `whatsapp_inbound_events_customer_id_fkey` (`customer_id`),
  CONSTRAINT `whatsapp_inbound_events_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `whatsapp_inbound_events_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `whatsapp_outbound_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `whatsapp_outbound_messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  `instance_id` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `external_message_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action_ids` json NOT NULL,
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` bigint unsigned DEFAULT NULL,
  `notification_log_id` bigint unsigned DEFAULT NULL,
  `error_code` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sent_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `delivered_at` datetime(3) DEFAULT NULL,
  `read_at` datetime(3) DEFAULT NULL,
  `failed_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `whatsapp_outbound_messages_public_id_key` (`public_id`),
  KEY `whatsapp_outbound_messages_tenant_id_external_message_id_idx` (`tenant_id`,`external_message_id`),
  KEY `whatsapp_outbound_messages_tenant_id_sent_at_idx` (`tenant_id`,`sent_at`),
  KEY `whatsapp_outbound_messages_customer_id_fkey` (`customer_id`),
  KEY `whatsapp_outbound_messages_notification_log_id_fkey` (`notification_log_id`),
  CONSTRAINT `whatsapp_outbound_messages_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `whatsapp_outbound_messages_notification_log_id_fkey` FOREIGN KEY (`notification_log_id`) REFERENCES `notification_logs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `whatsapp_outbound_messages_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
