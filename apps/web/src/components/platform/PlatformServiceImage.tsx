import { useEffect, useState } from 'react';

import { environment } from '../../config/environment.js';

export function PlatformServiceImage({
  alt,
  servicePublicId,
  tenantPublicId,
  version,
  variant = 'thumbnail',
  size,
}: {
  alt: string;
  servicePublicId: string;
  tenantPublicId: string;
  version?: string;
  variant?: 'original' | 'thumbnail';
  size?: { width: number; height: number };
}) {
  const [source, setSource] = useState<string | null>(null);
  const defaultSize = size || { width: 56, height: 56 };

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void fetch(
      `${environment.apiUrl}/platform/tenants/${tenantPublicId}/services/${servicePublicId}/image?variant=${variant}`,
      {
        credentials: 'include',
      },
    )
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
  }, [servicePublicId, tenantPublicId, version, variant]);

  return source === null ? null : (
    <img
      alt={alt}
      src={source}
      style={{
        width: `${defaultSize.width}px`,
        height: `${defaultSize.height}px`,
        objectFit: 'cover',
        borderRadius: '4px',
        border: '1px solid #e5e5e5',
      }}
    />
  );
}
