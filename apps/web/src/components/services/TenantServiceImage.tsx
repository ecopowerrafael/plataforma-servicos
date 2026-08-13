import { useEffect, useState } from 'react';

import { environment } from '../../config/environment.js';

export function TenantServiceImage({
  alt,
  servicePublicId,
  tenantPublicId,
  kind = 'services',
}: {
  alt: string;
  servicePublicId: string;
  tenantPublicId: string;
  kind?: 'services' | 'combos' | 'products';
}) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void fetch(`${environment.apiUrl}/tenant/${kind}/${servicePublicId}/image?variant=thumbnail`, {
      credentials: 'include',
      headers: { 'X-Tenant-Id': tenantPublicId },
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
  }, [servicePublicId, tenantPublicId, kind]);
  return source === null ? null : <img alt={alt} className="service-thumbnail" src={source} />;
}
