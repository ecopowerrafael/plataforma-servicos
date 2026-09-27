-- AlterTable
ALTER TABLE `commercial_commissions` ADD COLUMN `paymentId` VARCHAR(255),
ADD COLUMN `paymentSource` ENUM('GATEWAY', 'PIX', 'CARD', 'COMMERCIAL_WALLET', 'MANUAL_ADMIN');

-- CreateIndex
CREATE INDEX `commercial_commissions_paymentId_idx` ON `commercial_commissions`(`paymentId`);
