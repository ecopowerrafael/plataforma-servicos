import { useEffect, useState } from 'react';

import { environment } from '../../config/environment.js';

export function PlatformServiceImage({
  alt,
  servicePublicId,
  tenantPublicId,
  version,
}: {
  alt: string;
  servicePublicId: string;
  tenantPublicId: string;
  version?: string;
}) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void fetch(`${environment.apiUrl}/platform/tenants/${tenantPublicId}/services/${servicePublicId}/image`, {
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('IMAGE_UNAVAILABLE');
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
  }, [servicePublicId, tenantPublicId, version]);
  return source === null ? null : (
    <img
      alt={alt}
      src={source}
      style={{
        width: '56px',
        height: '56px',
        objectFit: 'cover',
        borderRadius: '4px',
        border: '1px solid #e5e5e5',
      }}
    />
  );
}
