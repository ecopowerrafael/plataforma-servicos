import { type PrismaClient } from '../../database-client/client.js';

export class AppointmentCancellationService {
  public constructor(private readonly client: PrismaClient) {}

  /**
   * When appointment is cancelled, mark all pending reminders as SKIPPED
   * so they are not delivered.
   */
  public async handleAppointmentCancellation(appointmentId: bigint): Promise<void> {
    const appointment = await this.client.appointment.findUnique({
      where: { id: appointmentId },
      select: { publicId: true },
    });
    if (!appointment) return;

    await this.client.notificationLog.updateMany({
      where: {
        targetType: 'appointment',
        targetPublicId: appointment.publicId,
        kind: { in: ['appointment.day_before_reminder', 'appointment.upcoming_reminder'] },
        status: 'PENDING',
      },
      data: { status: 'SKIPPED' },
    });
  }
}
