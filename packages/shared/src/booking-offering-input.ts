/**
 * Discriminated union for booking offering: exactly one of service or combo, never both.
 * Used throughout availability, appointment creation, and responses to enforce XOR at type-level.
 */

export type BookingOfferingInput =
  | {
      servicePublicId: string;
      comboPublicId?: never;
    }
  | {
      comboPublicId: string;
      servicePublicId?: never;
    };

export function isServiceBookingInput(input: BookingOfferingInput): input is {
  servicePublicId: string;
} {
  return 'servicePublicId' in input && input.servicePublicId !== undefined;
}

export function isComboBookingInput(input: BookingOfferingInput): input is {
  comboPublicId: string;
} {
  return 'comboPublicId' in input && input.comboPublicId !== undefined;
}
