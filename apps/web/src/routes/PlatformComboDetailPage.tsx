import { useParams } from 'react-router-dom';
import { ComboDetailPage } from '../components/platform/ComboDetailPage.js';

export function PlatformComboDetailPage() {
  const { tenantPublicId } = useParams<{ tenantPublicId: string }>();
  if (!tenantPublicId) return <p>Tenant não encontrado.</p>;
  return <ComboDetailPage tenantPublicId={tenantPublicId} />;
}
