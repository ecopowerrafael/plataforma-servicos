import { trackPixelEvent } from '../hooks/useMetaPixel.js';

/**
 * Track appointment booking events for Meta Pixel
 */
export const appointmentPixelEvents = {
  /**
   * Track when appointment booking flow is initiated
   */
  initiateCheckout: (appointmentData: { price: number; serviceId?: string; professionalId?: string }) => {
    trackPixelEvent('InitiateCheckout', {
      value: appointmentData.price / 100, // Convert cents to dollars for Facebook
      currency: 'BRL',
      content_type: 'appointment',
      content_ids: appointmentData.serviceId ? [appointmentData.serviceId] : [],
    });
  },

  /**
   * Track successful appointment booking
   */
  purchaseComplete: (appointmentData: {
    id: string;
    price: number;
    serviceId?: string;
    professionalId?: string;
  }) => {
    trackPixelEvent('Purchase', {
      value: appointmentData.price / 100, // Convert cents to dollars for Facebook
      currency: 'BRL',
      transaction_id: appointmentData.id,
      content_type: 'appointment',
      content_ids: appointmentData.serviceId ? [appointmentData.serviceId] : [],
    });
  },

  /**
   * Track appointment booking cancellation
   */
  cancelAppointment: (appointmentData: { id: string; price: number }) => {
    trackPixelEvent('Purchase', {
      value: appointmentData.price / 100,
      currency: 'BRL',
      transaction_id: `${appointmentData.id}_cancelled`,
      content_type: 'appointment_cancelled',
    });
  },

  /**
   * Track customer registration completion
   */
  registrationComplete: () => {
    trackPixelEvent('CompleteRegistration', {
      status: 'completed',
    });
  },

  /**
   * Track service viewed
   */
  serviceViewed: (serviceData: { id: string; price: number; name: string }) => {
    trackPixelEvent('ViewContent', {
      content_ids: [serviceData.id],
      content_name: serviceData.name,
      value: serviceData.price / 100,
      currency: 'BRL',
      content_type: 'service',
    });
  },

  /**
   * Track lead submission (contact form, etc)
   */
  leadSubmitted: (leadData?: { type?: string }) => {
    trackPixelEvent('Lead', {
      value: 0,
      currency: 'BRL',
      lead_type: leadData?.type || 'contact_form',
    });
  },
};
