import { PublicTenantSiteResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { contrastTextColor } from '../components/branding/brand-studio.js';
import { CustomerAppointments } from '../components/CustomerAppointments.js';
import { CustomerFavorites } from '../components/CustomerFavorites.js';
import { CustomerLoyalty } from '../components/CustomerLoyalty.js';
import { CustomerProfileForm } from '../components/CustomerProfileForm.js';
import { CustomerPushNotifications } from '../components/CustomerPushNotifications.js';
import { CustomerReviews } from '../components/CustomerReviews.js';
import {
  message,
  sectionFromPath,
  useCustomerAccount,
} from '../components/public/account/customer-account.js';
import { CustomerAccountAuth } from '../components/public/account/CustomerAccountAuth.js';
import { CustomerAccountHome } from '../components/public/account/CustomerAccountHome.js';
import { CustomerAccountLayout } from '../components/public/account/CustomerAccountLayout.js';
import { CustomerAccountSecurity } from '../components/public/account/CustomerAccountSecurity.js';
import { httpClient } from '../lib/http.js';

/**
 * Área do cliente em página inteira (`/public/:slug/conta[...]`), com o mesmo
 * branding da página pública.
 */
export function CustomerAccountPage() {
  const { slug = '', section: segment } = useParams();
  const section = sectionFromPath(segment);
  const navigate = useNavigate();
  const account = useCustomerAccount(slug);

  const site = useQuery({
    queryKey: ['public-site', slug],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}`, { schema: PublicTenantSiteResponseSchema }),
    retry: false,
  });

  if (site.isPending || account.me.isPending)
    return (
      <main className="customer-account customer-account--loading" aria-busy="true">
        <p>Carregando sua conta…</p>
      </main>
    );

  if (site.data === undefined)
    return (
      <main className="customer-account customer-account--loading">
        <h1>Página temporariamente indisponível</h1>
        <button className="public-primary-button" type="button" onClick={() => void site.refetch()}>
          Tentar novamente
        </button>
      </main>
    );

  const branding = site.data.branding;
  const customer = account.customer;

  return (
    <div
      className="public-theme customer-account-root"
      style={
        {
          '--tenant-primary': branding.primaryColor,
          '--tenant-on-primary':
            branding.onPrimaryColor ?? contrastTextColor(branding.primaryColor),
          '--tenant-secondary': branding.secondaryColor,
          '--tenant-accent': branding.accentColor,
          '--tenant-background': branding.backgroundColor,
          '--tenant-surface': branding.surfaceColor,
          '--tenant-text': branding.textColor,
          '--tenant-muted': branding.mutedTextColor,
          '--tenant-border': branding.borderColor,
          '--tenant-radius': branding.borderRadius,
          '--tenant-font': branding.fontFamily,
          '--tenant-header': branding.headerColor ?? branding.backgroundColor,
          '--tenant-header-text': branding.headerTextColor ?? branding.textColor,
          '--tenant-navigation': branding.navigationColor ?? branding.surfaceColor,
          '--tenant-active': branding.activeColor ?? branding.primaryColor,
        } as CSSProperties
      }
    >
      <CustomerAccountLayout
        slug={slug}
        displayName={site.data.displayName}
        section={section}
        customer={customer}
        {...(customer === null
          ? {}
          : {
              onLogout: () => {
                account.logout.mutate(undefined, { onSuccess: () => void navigate(`/public/${slug}`) });
              },
            })}
      >
        {customer === null ? <CustomerAccountAuth account={account} /> : null}
        {customer !== null && section === 'home' ? (
          <CustomerAccountHome slug={slug} name={customer.name} />
        ) : null}
        {customer !== null && section === 'profile' ? (
          account.profile.data === undefined ? (
            <p className="customer-skeleton" aria-busy="true" />
          ) : (
            <CustomerProfileForm
              profile={account.profile.data}
              busy={account.updateProfile.isPending}
              error={message(account.updateProfile.error)}
              onSave={async (value) => {
                await account.updateProfile.mutateAsync(value);
              }}
            />
          )
        ) : null}
        {customer !== null && section === 'appointments' ? (
          <CustomerAppointments slug={slug} />
        ) : null}
        {customer !== null && section === 'loyalty' ? <CustomerLoyalty slug={slug} /> : null}
        {customer !== null && section === 'favorites' ? (
          <CustomerFavorites
            slug={slug}
            services={site.data.services.map((item) => ({
              publicId: item.publicId,
              name: item.name,
            }))}
            professionals={site.data.professionals.map((item) => ({
              publicId: item.publicId,
              name: item.name,
            }))}
          />
        ) : null}
        {customer !== null && section === 'reviews' ? <CustomerReviews slug={slug} /> : null}
        {customer !== null && section === 'notifications' ? (
          <CustomerPushNotifications slug={slug} />
        ) : null}
        {customer !== null && section === 'security' ? (
          <CustomerAccountSecurity slug={slug} account={account} />
        ) : null}
      </CustomerAccountLayout>
    </div>
  );
}
