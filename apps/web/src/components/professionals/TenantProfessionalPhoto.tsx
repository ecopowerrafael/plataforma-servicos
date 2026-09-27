import { useEffect, useState } from 'react';

import { environment } from '../../config/environment.js';

export function TenantProfessionalPhoto({
  name,
  professionalPublicId,
  tenantPublicId,
  size = 'small',
  version,
}: {
  name: string;
  professionalPublicId: string;
  tenantPublicId: string;
  size?: 'small' | 'large';
  /** Muda quando a foto é trocada ou removida, forçando o recarregamento. */
  version?: string;
}) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void fetch(`${environment.apiUrl}/tenant/professionals/${professionalPublicId}/photo?variant=thumbnail`, {
      credentials: 'include',
      headers: { 'X-Tenant-Id': tenantPublicId },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('PHOTO_UNAVAILABLE');
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setSource(objectUrl);
      })
      .catch(() => {
        if (active) setSource(null);
      });
    return () => {
      active = false;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [professionalPublicId, tenantPublicId, version]);

  const initials = name
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span className={`professional-avatar professional-avatar-${size}`} aria-label={name}>
      {source === null ? initials : <img alt={name} src={source} />}
    </span>
  );
}
