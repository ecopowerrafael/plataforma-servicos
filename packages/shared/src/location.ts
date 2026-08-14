import { z } from 'zod';

export const GoogleMapsUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) =>
      /^https:\/\/(?:maps\.app\.goo\.gl|maps\.google\.com)(?:\/|$)/iu.test(value) ||
      /^https:\/\/(?:www\.)?google\.com\/maps(?:\/|\?|$)/iu.test(value),
    'Informe um link HTTPS válido do Google Maps.',
  );

export const LatitudeSchema = z.number().min(-90).max(90);
export const LongitudeSchema = z.number().min(-180).max(180);

export interface StructuredLocation {
  street?: string | null | undefined;
  number?: string | null | undefined;
  complement?: string | null | undefined;
  district?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  postalCode?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  googleMapsUrl?: string | null | undefined;
}

const present = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? null : normalized;
};

export function hasCompleteAddress(location: StructuredLocation): boolean {
  return [location.street, location.number, location.district, location.city, location.state].every(
    (value) => present(value) !== null,
  );
}

export function formatStructuredAddress(location: StructuredLocation): string[] {
  const street = present(location.street);
  const number = present(location.number);
  const complement = present(location.complement);
  const district = present(location.district);
  const city = present(location.city);
  const state = present(location.state);
  const postalCode = present(location.postalCode);
  const first = [street, number].filter(Boolean).join(', ');
  const locality =
    district === null
      ? ''
      : city === null
        ? district
        : `${district} — ${city}${state === null ? '' : `/${state}`}`;
  const cityOnly =
    district === null && city !== null ? `${city}${state === null ? '' : `/${state}`}` : '';
  return [
    first,
    complement,
    locality || cityOnly,
    postalCode === null ? '' : `CEP ${postalCode}`,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export function googleMapsDestination(location: StructuredLocation): string | null {
  if (location.googleMapsUrl && GoogleMapsUrlSchema.safeParse(location.googleMapsUrl).success)
    return location.googleMapsUrl;
  if (location.latitude != null && location.longitude != null)
    return `https://www.google.com/maps/search/?api=1&query=${String(location.latitude)},${String(location.longitude)}`;
  if (!hasCompleteAddress(location)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatStructuredAddress(location).join(', '))}`;
}

export function googleMapsEmbed(location: StructuredLocation): string | null {
  if (location.latitude != null && location.longitude != null)
    return `https://www.google.com/maps?q=${String(location.latitude)},${String(location.longitude)}&z=16&output=embed`;
  if (!hasCompleteAddress(location)) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(formatStructuredAddress(location).join(', '))}&output=embed`;
}
