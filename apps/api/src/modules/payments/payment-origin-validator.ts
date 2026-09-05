import { AppError } from '../../errors/AppError.js';

export function validatePaymentOrigin(
  originType: string,
  appointmentId: bigint | null,
  membershipChargeId: bigint | null,
  debtId: bigint | null = null,
) {
  if (originType === 'APPOINTMENT') {
    if (appointmentId === null) {
      throw new AppError({
        code: 'PAYMENT_ORIGIN_APPOINTMENT_REQUIRES_ID',
        message: 'Pagamento APPOINTMENT requer appointmentId.',
        statusCode: 400,
      });
    }
    if (membershipChargeId !== null) {
      throw new AppError({
        code: 'PAYMENT_ORIGIN_APPOINTMENT_FORBIDS_MEMBERSHIP',
        message: 'Pagamento APPOINTMENT não pode ter membershipChargeId.',
        statusCode: 400,
      });
    }
    if (debtId !== null) {
      throw new AppError({
        code: 'PAYMENT_ORIGIN_APPOINTMENT_FORBIDS_DEBT',
        message: 'Pagamento APPOINTMENT não pode ter debtId.',
        statusCode: 400,
      });
    }
  }

  if (originType === 'MEMBERSHIP_CHARGE') {
    if (membershipChargeId === null) {
      throw new AppError({
        code: 'PAYMENT_ORIGIN_MEMBERSHIP_REQUIRES_ID',
        message: 'Pagamento MEMBERSHIP_CHARGE requer membershipChargeId.',
        statusCode: 400,
      });
    }
    if (appointmentId !== null) {
      throw new AppError({
        code: 'PAYMENT_ORIGIN_MEMBERSHIP_FORBIDS_APPOINTMENT',
        message: 'Pagamento MEMBERSHIP_CHARGE não pode ter appointmentId.',
        statusCode: 400,
      });
    }
    if (debtId !== null) {
      throw new AppError({
        code: 'PAYMENT_ORIGIN_MEMBERSHIP_FORBIDS_DEBT',
        message: 'Pagamento MEMBERSHIP_CHARGE não pode ter debtId.',
        statusCode: 400,
      });
    }
  }

  if (originType === 'DEBT') {
    if (debtId === null) {
      throw new AppError({
        code: 'PAYMENT_ORIGIN_DEBT_REQUIRES_ID',
        message: 'Pagamento DEBT requer debtId.',
        statusCode: 400,
      });
    }
    if (appointmentId !== null) {
      throw new AppError({
        code: 'PAYMENT_ORIGIN_DEBT_FORBIDS_APPOINTMENT',
        message: 'Pagamento DEBT não pode ter appointmentId.',
        statusCode: 400,
      });
    }
    if (membershipChargeId !== null) {
      throw new AppError({
        code: 'PAYMENT_ORIGIN_DEBT_FORBIDS_MEMBERSHIP',
        message: 'Pagamento DEBT não pode ter membershipChargeId.',
        statusCode: 400,
      });
    }
  }
}
