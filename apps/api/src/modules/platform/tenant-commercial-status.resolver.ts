import { TenantCommercialStatusSchema, type TenantCommercialStatus } from '@plataforma/shared';

type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED' | 'EXPIRED';
type PublicSiteBehavior = 'NORMAL' | 'HIDE_BOOKING' | 'OFFLINE';

export interface ResolvableSubscription {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  graceEndsAt: Date | null;
}

export interface ResolvableCommercialPolicy {
  autoSuspendAfterGrace: boolean;
  allowAdminLoginWhileBlocked: boolean;
  allowCalendarReadWhileBlocked: boolean;
  allowAdminChangesWhileBlocked: boolean;
  allowInternalBookingWhileBlocked: boolean;
  allowPublicBookingWhileBlocked: boolean;
  publicSiteBehaviorWhileBlocked: PublicSiteBehavior;
  adminMessage: string;
  publicMessage: string;
}

export class TenantCommercialStatusResolver {
  public resolve(
    subscription: ResolvableSubscription,
    policy: ResolvableCommercialPolicy,
    now: Date = new Date(),
  ): TenantCommercialStatus {
    const state = this.resolveState(subscription, now);
    const blocked = state !== 'TRIALING' && state !== 'ACTIVE';

    const trialDaysRemaining =
      state === 'TRIALING' && subscription.trialEndsAt !== null
        ? Math.max(0, Math.ceil((subscription.trialEndsAt.getTime() - now.getTime()) / 86_400_000))
        : null;

    const capabilities = this.resolveCapabilities(state, policy);

    const result: TenantCommercialStatus = {
      state,
      trialDaysRemaining,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      currentPeriodEndsAt: subscription.currentPeriodEndsAt?.toISOString() ?? null,
      graceEndsAt: subscription.graceEndsAt?.toISOString() ?? null,
      capabilities,
      adminMessage: blocked ? policy.adminMessage : null,
      publicMessage: blocked ? policy.publicMessage : null,
      publicSiteBehavior: policy.publicSiteBehaviorWhileBlocked,
    };
    return TenantCommercialStatusSchema.parse(result);
  }

  private resolveState(
    subscription: ResolvableSubscription,
    now: Date,
  ): TenantCommercialStatus['state'] {
    if (subscription.status === 'TRIALING') return 'TRIALING';
    if (subscription.status === 'ACTIVE') return 'ACTIVE';
    if (subscription.status === 'PAST_DUE') {
      return subscription.graceEndsAt !== null && subscription.graceEndsAt.getTime() > now.getTime()
        ? 'GRACE'
        : 'PAST_DUE';
    }
    return subscription.status;
  }

  private resolveCapabilities(
    state: TenantCommercialStatus['state'],
    policy: ResolvableCommercialPolicy,
  ): TenantCommercialStatus['capabilities'] {
    if (state === 'TRIALING' || state === 'ACTIVE') {
      return {
        canAccessAdmin: true,
        canReadCalendar: true,
        canManageData: true,
        canCreateInternalAppointment: true,
        canAcceptPublicBooking: true,
        canServePublicSite: true,
      };
    }
    if (state === 'PAST_DUE' || state === 'GRACE' || state === 'SUSPENDED') {
      return {
        canAccessAdmin: policy.allowAdminLoginWhileBlocked,
        canReadCalendar: policy.allowCalendarReadWhileBlocked,
        canManageData: policy.allowAdminChangesWhileBlocked,
        canCreateInternalAppointment: policy.allowInternalBookingWhileBlocked,
        canAcceptPublicBooking: policy.allowPublicBookingWhileBlocked,
        canServePublicSite: policy.publicSiteBehaviorWhileBlocked !== 'OFFLINE',
      };
    }
    // CANCELED / EXPIRED
    return {
      canAccessAdmin: policy.allowAdminLoginWhileBlocked,
      canReadCalendar: policy.allowCalendarReadWhileBlocked,
      canManageData: false,
      canCreateInternalAppointment: false,
      canAcceptPublicBooking: false,
      canServePublicSite: policy.publicSiteBehaviorWhileBlocked !== 'OFFLINE',
    };
  }
}
