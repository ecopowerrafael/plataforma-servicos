-- CreateEnum: CommercialRole
CREATE TYPE "CommercialRole" AS ENUM ('MANAGER', 'REPRESENTATIVE', 'SELLER');

-- CreateEnum: CommercialAssignmentSource
CREATE TYPE "CommercialAssignmentSource" AS ENUM ('REGION_AUTO', 'CREATED_BY_MANAGER', 'CREATED_BY_REPRESENTATIVE', 'CREATED_BY_SELLER', 'GLOBAL_ADMIN', 'MANUAL_OVERRIDE');

-- CreateTable: commercial_accounts
CREATE TABLE "commercial_accounts" (
    "id" BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    "publicId" CHAR(36) NOT NULL,
    "userId" BIGINT UNSIGNED NOT NULL,
    "role" "CommercialRole" NOT NULL,
    "parentId" BIGINT UNSIGNED NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "defaultCommissionBps" INT NOT NULL DEFAULT 0,
    "created_at" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    "updated_at" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    "created_by_user_id" BIGINT UNSIGNED NOT NULL,

    UNIQUE INDEX "commercial_accounts_publicId_key"("publicId"),
    INDEX "commercial_accounts_userId_idx"("userId"),
    INDEX "commercial_accounts_parentId_idx"("parentId"),
    INDEX "commercial_accounts_created_by_user_id_idx"("created_by_user_id"),
    INDEX "commercial_accounts_role_idx"("role"),

    PRIMARY KEY ("id")
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: commercial_regions
CREATE TABLE "commercial_regions" (
    "id" BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    "publicId" CHAR(36) NOT NULL,
    "managerId" BIGINT UNSIGNED NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    "updated_at" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX "commercial_regions_publicId_key"("publicId"),
    INDEX "commercial_regions_managerId_idx"("managerId"),
    INDEX "commercial_regions_active_idx"("active"),

    PRIMARY KEY ("id")
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: commercial_region_cities
CREATE TABLE "commercial_region_cities" (
    "id" BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    "regionId" BIGINT UNSIGNED NOT NULL,
    "ibgeCode" CHAR(7) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "state" CHAR(2) NOT NULL,
    "created_at" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX "commercial_region_cities_ibgeCode_key"("ibgeCode"),
    INDEX "commercial_region_cities_regionId_idx"("regionId"),
    INDEX "commercial_region_cities_ibgeCode_idx"("ibgeCode"),

    PRIMARY KEY ("id")
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: tenant_commercial_assignments
CREATE TABLE "tenant_commercial_assignments" (
    "id" BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    "tenantId" BIGINT UNSIGNED NOT NULL,
    "managerId" BIGINT UNSIGNED NULL,
    "representativeId" BIGINT UNSIGNED NULL,
    "sellerId" BIGINT UNSIGNED NULL,
    "source" "CommercialAssignmentSource" NOT NULL DEFAULT 'REGION_AUTO',
    "assigned_at" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    "assigned_by_user_id" BIGINT UNSIGNED NULL,

    UNIQUE INDEX "tenant_commercial_assignments_tenantId_key"("tenantId"),
    INDEX "tenant_commercial_assignments_tenantId_idx"("tenantId"),
    INDEX "tenant_commercial_assignments_managerId_idx"("managerId"),
    INDEX "tenant_commercial_assignments_representativeId_idx"("representativeId"),
    INDEX "tenant_commercial_assignments_sellerId_idx"("sellerId"),

    PRIMARY KEY ("id")
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE "commercial_accounts" ADD CONSTRAINT "commercial_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_accounts" ADD CONSTRAINT "commercial_accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "commercial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_accounts" ADD CONSTRAINT "commercial_accounts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_regions" ADD CONSTRAINT "commercial_regions_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "commercial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_region_cities" ADD CONSTRAINT "commercial_region_cities_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "commercial_regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_commercial_assignments" ADD CONSTRAINT "tenant_commercial_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_commercial_assignments" ADD CONSTRAINT "tenant_commercial_assignments_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "commercial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_commercial_assignments" ADD CONSTRAINT "tenant_commercial_assignments_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "commercial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_commercial_assignments" ADD CONSTRAINT "tenant_commercial_assignments_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "commercial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_commercial_assignments" ADD CONSTRAINT "tenant_commercial_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
