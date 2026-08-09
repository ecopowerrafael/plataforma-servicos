import { Link } from 'react-router-dom';

import { AuthLayout } from '../components/AuthLayout.js';

export function AccessDeniedPage() {
  return (
    <AuthLayout
      title="Acesso não autorizado"
      description="Sua conta não possui permissão para esta operação."
      footer={<Link to="/">Voltar ao início</Link>}
    >
      <p>
        Se o acesso for necessário, solicite a alteração do seu vínculo ao responsável pelo
        estabelecimento.
      </p>
    </AuthLayout>
  );
}
