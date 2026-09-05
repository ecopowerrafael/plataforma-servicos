import {
  formatStructuredAddress,
  googleMapsDestination,
  googleMapsEmbed,
  type PublicTenantSiteResponseSchema,
} from '@plataforma/shared';
import { IconMapPin, IconNavigation } from '@tabler/icons-react';
import { type z } from 'zod';

type Site = z.infer<typeof PublicTenantSiteResponseSchema>;

export function PublicLocationSection({
  unit,
  displayName,
  premium = false,
}: {
  unit: Site['unit'];
  displayName: string;
  premium?: boolean;
}) {
  if (unit === null) return null;
  const lines = formatStructuredAddress(unit);
  const mapUrl = googleMapsEmbed(unit);
  const destination = googleMapsDestination(unit);
  if (lines.length === 0 && mapUrl === null && destination === null) return null;
  return (
    <section
      className={`public-location${premium ? ' public-location--premium premium-section' : ''}`}
      aria-labelledby="public-location-title"
    >
      <header className="public-location-heading">
        <span>
          <IconMapPin aria-hidden="true" />
        </span>
        <div>
          <p>Localização</p>
          <h2 id="public-location-title">Encontre {displayName}</h2>
        </div>
      </header>
      <div className="public-location-card">
        {lines.length ? (
          <address>
            {lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </address>
        ) : null}
        {mapUrl ? (
          <iframe
            title={`Mapa de ${displayName}`}
            src={mapUrl}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : null}
        {destination ? (
          <a
            className="public-location-cta"
            href={destination}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconNavigation size={19} aria-hidden="true" />
            Como chegar
          </a>
        ) : null}
      </div>
    </section>
  );
}
