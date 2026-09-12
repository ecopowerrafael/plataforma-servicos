import { describe, expect, it } from 'vitest';
import { TenantSettingsSchema, AppointmentIntervalSchema } from '@plataforma/shared';

describe('Appointment Interval Validation', () => {
  describe('AppointmentIntervalSchema', () => {
    it('accepts preset intervals: 10, 15, 30, 60', () => {
      expect(() => AppointmentIntervalSchema.parse(10)).not.toThrow();
      expect(() => AppointmentIntervalSchema.parse(15)).not.toThrow();
      expect(() => AppointmentIntervalSchema.parse(30)).not.toThrow();
      expect(() => AppointmentIntervalSchema.parse(60)).not.toThrow();
    });

    it('accepts custom intervals within 5-120 range', () => {
      expect(() => AppointmentIntervalSchema.parse(5)).not.toThrow();
      expect(() => AppointmentIntervalSchema.parse(20)).not.toThrow();
      expect(() => AppointmentIntervalSchema.parse(45)).not.toThrow(); // Custom personalizado
      expect(() => AppointmentIntervalSchema.parse(90)).not.toThrow();
      expect(() => AppointmentIntervalSchema.parse(120)).not.toThrow();
    });

    it('rejects intervals below 5 or above 120', () => {
      expect(() => AppointmentIntervalSchema.parse(4)).toThrow();
      expect(() => AppointmentIntervalSchema.parse(0)).toThrow();
      expect(() => AppointmentIntervalSchema.parse(-1)).toThrow();
      expect(() => AppointmentIntervalSchema.parse(121)).toThrow();
      expect(() => AppointmentIntervalSchema.parse(200)).toThrow();
    });

    it('rejects non-integer intervals', () => {
      expect(() => AppointmentIntervalSchema.parse(15.5)).toThrow();
      expect(() => AppointmentIntervalSchema.parse(45.25)).toThrow();
    });
  });

  describe('TenantSettingsSchema - with custom interval', () => {
    it('accepts settings with personalizado interval (45 minutes)', () => {
      const settings = {
        allowMultipleUnits: false,
        defaultAppointmentIntervalMinutes: 45,
        minimumAdvanceMinutes: 0,
        maximumAdvanceDays: 180,
        weekStartsOn: 'MONDAY' as const,
        dateFormat: 'DD/MM/YYYY' as const,
        timeFormat: '24H' as const,
      };

      expect(() => TenantSettingsSchema.parse(settings)).not.toThrow();
      const parsed = TenantSettingsSchema.parse(settings);
      expect(parsed.defaultAppointmentIntervalMinutes).toBe(45);
    });

    it('accepts various custom intervals in settings', () => {
      for (const interval of [5, 10, 15, 20, 25, 30, 45, 60, 90, 120]) {
        const settings = {
          allowMultipleUnits: false,
          defaultAppointmentIntervalMinutes: interval,
          minimumAdvanceMinutes: 0,
          maximumAdvanceDays: 180,
          weekStartsOn: 'MONDAY' as const,
          dateFormat: 'DD/MM/YYYY' as const,
          timeFormat: '24H' as const,
        };
        expect(() => TenantSettingsSchema.parse(settings)).not.toThrow();
      }
    });
  });
});
