import { useParams } from 'react-router-dom';
import { ProfessionalDetailPage } from '../components/platform/ProfessionalDetailPage.js';

export function PlatformProfessionalDetailPage() {
  const { tenantPublicId } = useParams<{ tenantPublicId: string }>();
  if (!tenantPublicId) return <p>Tenant não encontrado</p>;
  return <ProfessionalDetailPage tenantPublicId={tenantPublicId} />;
}
