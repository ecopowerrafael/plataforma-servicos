# Phase 2 - Stage 1C: Finalized Architectural Decisions

## Completed: 2026-09-04

### Verified Database Schema (Real MySQL 8.0.46)

**Appointments Table (Current State):**
- `service_id`: `bigint unsigned NOT NULL` with FK to `services.id`
- No `combo_id`, `combo_public_id` fields yet
- CHECK constraints supported ✓

**Combos Table:**
- `id`: `bigint unsigned` (auto_increment) — compatible with appointments.service_id type
- `public_id`: `char(36)`

**Prisma Constraints:**
- Service relation was mandatory; must be nullable for combo-only appointments
- Combo model had no relation to Appointment; required for bi-directional access

---

## Schema Changes Finalized

### 1. Appointment Model (Prisma schema.prisma)

**Changed:**
```prisma
serviceId    BigInt    @map("service_id")  // NOW: BigInt? (nullable)
// NEW FIELDS:
comboId      BigInt?   @map("combo_id")
comboPublicId String?  @map("combo_public_id") @db.Char(36)

// RELATION CHANGED:
service      Service?  // NOW: optional (was mandatory)
// NEW RELATION:
combo        Combo?    @relation(fields: [comboId], references: [id], ...)
```

**Justification:**
- XOR constraint (exactly one of service OR combo) enforced at database level
- `comboPublicId` snapshot prevents issues if combo.publicId changes after booking
- Type mismatch resolved: both `combo.id` and `appointment.service_id` are `bigint unsigned`

### 2. Combo Model (Prisma schema.prisma)

**Added:**
```prisma
appointments  Appointment[]
```

**Justification:**
- Establishes bi-directional relation for Prisma ORM consistency
- Allows efficient loading of appointments for a combo via `combo.appointments`

### 3. Database Migration (SQL)

**File:** `apps/api/prisma/migrations/20260904_combo_booking_appointments/migration.sql`

**Operations (in order):**
1. Drop existing FK on `appointments.service_id`
2. Alter `service_id` to `bigint unsigned NULL`
3. Re-add FK with same constraints
4. Add `combo_id` column (FK to `combos.id`)
5. Add `combo_public_id` snapshot column
6. Add CHECK constraint: `(service_id IS NOT NULL AND combo_id IS NULL) OR (service_id IS NULL AND combo_id IS NOT NULL)`
7. Create index on `combo_public_id` for lookup performance

**Rationale:**
- Incremental steps prevent constraint violation errors
- XOR check prevents invalid states at database level
- Index on `combo_public_id` matches pattern of other lookups (e.g., `service_public_id`)

---

## Blockers Identified (Require Phase 2 Stage 2)

### 1. AppointmentReview Service
**Location:** `apps/api/src/modules/appointments/appointment-review.service.ts:77`

**Current Issue:** Creates review with `serviceId: appointment.serviceId`
**Impact:** Crashes when `appointment.serviceId` is NULL (combo appointments)

**Solution Path:**
- Make `AppointmentReview.serviceId` nullable
- Add validation: reject reviews for combo appointments in Phase 1 (explicit block)
- Add comment: "Combo reviews deferred: requires UX for multi-service reviews"

### 2. ProfessionalCommission Service
**Location:** `apps/api/src/modules/payments/professional-commission.service.ts:65-128`

**Current Issue:** `recordForPayment()` method does:
```typescript
professionalService.findFirst({
  where: { professionalId, serviceId: appointment.serviceId }
})
```

**Impact:** Crashes when `appointment.serviceId` is NULL (combo appointments)

**Solution Path:**
- Implement commission strategy: **Use professional default commission for combo appointments**
- Rationale: Combo has its own price; professional default is safety fallback
- Skip individual service overrides for combos (architectural simplicity)
- Add unit tests for combo commission lookup

### 3. Appointment Notifications
**Location:** 40+ files accessing `appointment.service.name`

**Current Issue:** Notifications assume `appointment.service` always exists
**Impact:** NULL reference errors when loading combo appointments

**Solution Path:**
- Lazy-load `service` or `combo` relation conditionally:
  ```typescript
  const offering = appointment.service ?? appointment.combo;
  const offeringName = offering?.name;
  ```
- Add test: notifications work for both service and combo bookings
- Alternative: Create notification helper function to encapsulate logic

### 4. Appointment Response Contract
**Location:** Multiple endpoints returning appointment data

**Current Issue:** Public/internal responses assume `serviceId` and `serviceName` always exist
**Impact:** Incomplete data contracts; unclear which fields are nullable

**Solution Path:**
- Define response schemas with explicit nullable fields:
  ```typescript
  servicePublicId?: string  // null for combos
  serviceName?: string      // null for combos
  comboPublicId?: string    // null for services
  comboName?: string        // null for services
  ```
- Add `offering` union type for convenience: `offering: Service | Combo`

### 5. Availability Validation
**Location:** `SlotsService` (where availability is computed)

**Current Issue:** Slot calculation based on `service.durationMinutes`
**Impact:** Combos have their own duration; how to compute when professional has both?

**Solution Path:**
- Availability computed independently per service/combo
- XOR constraint ensures appointment duration is unambiguous once booked
- No changes needed at this phase; validate during booking request validation

---

## Summary of Files Modified

1. **apps/api/prisma/schema.prisma**
   - Updated `Appointment.serviceId` to nullable
   - Added `Appointment.comboId`, `Appointment.comboPublicId` fields
   - Changed `Appointment.service` relation to optional
   - Added `Appointment.combo` relation
   - Added `Combo.appointments` bi-directional relation

2. **apps/api/prisma/migrations/20260904_combo_booking_appointments/migration.sql**
   - Created migration with all database column/constraint changes
   - Includes rollback-safe incremental steps

---

## Next Steps (Phase 2 Stage 2)

1. Update `AppointmentReview` model and service (explicit rejection for combos)
2. Implement commission strategy in `ProfessionalCommissionService`
3. Audit and update all notification senders (40+ files)
4. Define appointment response schemas with nullable offering fields
5. Add integration tests for combo-based appointments end-to-end

---

## Known Constraints & Assumptions

- **XOR Enforcement:** Database CHECK constraint validates mutual exclusivity (MySQL 8.0.16+) ✓
- **Price Immutability:** Price stored at booking time; snapshots prevent historical issues ✓
- **Snapshot Scope:** Only `comboPublicId` snapshotted; other combo data loaded on demand
- **Professional Commission:** Defaults to professional's base commission (overrides ignored for combos)
- **Reviews:** Explicitly blocked for combos in Phase 1 (no multi-service review support)
