# Prisma migration chain V2

This directory is the canonical migration path for new environments and deployments.

- `schema.prisma` remains the single application schema at `../prisma/schema.prisma`.
- `migrations/00000000000000_production_v1` is the only baseline migration.
- The legacy migrations under `../prisma/migrations` remain preserved for audit and rollback evidence; they are not read by this chain.
- Always pass an explicit `V2_DATABASE_URL` and verify it is the intended local test database before destructive test setup.

The baseline SQL excludes `_prisma_migrations`; Prisma creates and owns that technical table when applying the chain.
