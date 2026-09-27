import { useParams } from 'react-router-dom';
import { ServiceDetailPage } from '../components/platform/ServiceDetailPage.js';

export function PlatformServiceDetailPage() {
  const { tenantPublicId } = useParams<{ tenantPublicId: string }>();
  if (!tenantPublicId) return <p>Tenant não encontrado</p>;
  return <ServiceDetailPage tenantPublicId={tenantPublicId} />;
}
