export type AppointmentSubject = 'service' | 'combo';

export function getAppointmentSubject(appointment: {
  serviceId: bigint | null;
  comboId: bigint | null;
}): AppointmentSubject | null {
  if (appointment.serviceId !== null && appointment.comboId === null) return 'service';
  if (appointment.serviceId === null && appointment.comboId !== null) return 'combo';
  return null;
}

export function isServiceAppointment(appointment: {
  serviceId: bigint | null;
  comboId: bigint | null;
}): appointment is { serviceId: bigint; comboId: null; service: { name: string; publicId: string } } {
  return appointment.serviceId !== null && appointment.comboId === null;
}

export function isComboAppointment(appointment: {
  serviceId: bigint | null;
  comboId: bigint | null;
}): appointment is { serviceId: null; comboId: bigint; comboNameSnapshot: string | null } {
  return appointment.serviceId === null && appointment.comboId !== null;
}

export function assertServiceAppointment(appointment: {
  serviceId: bigint | null;
  comboId: bigint | null;
}): asserts appointment is { serviceId: bigint; comboId: null } {
  if (!isServiceAppointment(appointment)) {
    throw new Error(`Expected service appointment, got ${getAppointmentSubject(appointment)}`);
  }
}

export function assertComboAppointment(appointment: {
  serviceId: bigint | null;
  comboId: bigint | null;
}): asserts appointment is { serviceId: null; comboId: bigint } {
  if (!isComboAppointment(appointment)) {
    throw new Error(`Expected combo appointment, got ${getAppointmentSubject(appointment)}`);
  }
}

export function resolveAppointmentOfferingName(appointment: {
  service: { name: string } | null;
  comboNameSnapshot: string | null;
}): string | null {
  if (appointment.service) return appointment.service.name;
  if (appointment.comboNameSnapshot) return appointment.comboNameSnapshot;
  return null;
}

export function resolveAppointmentOfferingPublicId(appointment: {
  service: { publicId: string } | null;
  combo: { publicId: string } | null;
}): string | null {
  if (appointment.service) return appointment.service.publicId;
  if (appointment.combo) return appointment.combo.publicId;
  return null;
}
