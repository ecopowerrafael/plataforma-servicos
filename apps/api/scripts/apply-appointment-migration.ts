import { createPrismaClient } from '../src/database/connection.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL env var is required');
}
const prisma = createPrismaClient(databaseUrl);

async function main() {
  console.log('Applying appointment fields migration...');

  try {
    // Add charge_source column
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `appointments` ADD COLUMN `charge_source` VARCHAR(50) AFTER `price_cents`'
    );
    console.log('✓ Added charge_source column');
  } catch (e) {
    if ((e as any).message?.includes('Duplicate column')) {
      console.log('✓ charge_source column already exists');
    } else {
      throw e;
    }
  }

  try {
    // Add reference_price_cents column
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `appointments` ADD COLUMN `reference_price_cents` BIGINT UNSIGNED AFTER `charge_source`'
    );
    console.log('✓ Added reference_price_cents column');
  } catch (e) {
    if ((e as any).message?.includes('Duplicate column')) {
      console.log('✓ reference_price_cents column already exists');
    } else {
      throw e;
    }
  }

  try {
    // Add amount_due_cents column
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `appointments` ADD COLUMN `amount_due_cents` BIGINT UNSIGNED AFTER `reference_price_cents`'
    );
    console.log('✓ Added amount_due_cents column');
  } catch (e) {
    if ((e as any).message?.includes('Duplicate column')) {
      console.log('✓ amount_due_cents column already exists');
    } else {
      throw e;
    }
  }

  // Record the migration in _prisma_migrations
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`_prisma_migrations\` (id, checksum, finished_at, execution_time_in_millis, migration, rolled_back_at, started_at, applied_steps_count)
       VALUES ('20260921000000_add_membership_fields_to_appointment', 'bloco_g_manual', NOW(), 100, '20260921000000_add_membership_fields_to_appointment', NULL, NOW(), 3)`
    );
    console.log('✓ Recorded migration in _prisma_migrations');
  } catch (e) {
    if ((e as any).message?.includes('Duplicate entry')) {
      console.log('✓ Migration already recorded');
    } else {
      throw e;
    }
  }

  console.log('Migration completed successfully!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
