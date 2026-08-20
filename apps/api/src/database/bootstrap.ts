import { resolve } from 'node:path';

import { config } from 'dotenv';

import { createPrismaClient } from './connection.js';
import { buildDatabaseUrl } from '../config/database-url.js';
import { PasswordService } from '../modules/auth/password.service.js';
import { PlatformService } from '../modules/platform/platform.service.js';

// Carrega o .env local (desenvolvimento) sem exigir a validação completa do
// ambiente da aplicação — o bootstrap precisa apenas da conexão com o banco,
// construída a partir de DB_*/DATABASE_URL. Assim ele roda com segurança no
// passo de build/deploy (onde nem todas as variáveis da API estão presentes).
config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });

const permissions = [
  ['tenant.read', 'Consultar dados do estabelecimento.'],
  ['tenant.update', 'Atualizar dados do estabelecimento.'],
  ['tenant.branding.read', 'Consultar a configura\u00e7\u00e3o visual do estabelecimento.'],
  ['tenant.branding.manage', 'Gerenciar identidade visual e p\u00e1gina p\u00fablica.'],
  ['tenant.subscription.read', 'Consultar o plano e a assinatura do estabelecimento.'],
  ['unit.read', 'Consultar unidades.'],
  ['unit.create', 'Criar unidades.'],
  ['unit.update', 'Atualizar unidades.'],
  ['membership.read', 'Consultar membros.'],
  ['membership.invite', 'Convidar membros.'],
  ['membership.update', 'Atualizar membros.'],
  ['membership.suspend', 'Suspender ou reativar membros.'],
  ['role.read', 'Consultar papéis.'],
  ['role.manage', 'Gerenciar papéis permitidos.'],
  ['session.read_own', 'Consultar as próprias sessões.'],
  ['session.revoke_own', 'Revogar as próprias sessões.'],
  ['audit.read', 'Consultar auditoria do estabelecimento.'],
  ['service.read', 'Consultar serviços.'],
  ['service.create', 'Criar serviços.'],
  ['service.update', 'Atualizar serviços.'],
  ['service.status.manage', 'Ativar ou desativar serviços.'],
  ['service.image.manage', 'Gerenciar imagens de serviços.'],
  ['service.category.read', 'Consultar categorias de servi\u00e7os.'],
  ['service.category.create', 'Criar categorias de servi\u00e7os.'],
  ['service.category.update', 'Atualizar categorias de servi\u00e7os.'],
  ['service.category.status.manage', 'Ativar ou desativar categorias de servi\u00e7os.'],
  ['service.variation.read', 'Consultar varia\u00e7\u00f5es de servi\u00e7os.'],
  ['service.variation.manage', 'Gerenciar varia\u00e7\u00f5es de servi\u00e7os.'],
  ['combo.read', 'Consultar combos.'],
  ['combo.create', 'Criar combos.'],
  ['combo.update', 'Atualizar combos.'],
  ['combo.status.manage', 'Ativar ou desativar combos.'],
  ['combo.image.manage', 'Gerenciar imagens de combos.'],
  ['professional.read', 'Consultar profissionais.'],
  ['professional.create', 'Criar profissionais.'],
  ['professional.update', 'Atualizar profissionais.'],
  ['professional.status.manage', 'Ativar ou desativar profissionais.'],
  ['professional.image.manage', 'Gerenciar fotos de profissionais.'],
  ['professional.service.read', 'Consultar vínculos de profissionais e serviços.'],
  ['professional.service.manage', 'Gerenciar vínculos de profissionais e serviços.'],
  ['professional.unit.read', 'Consultar vínculos de profissionais e unidades.'],
  ['professional.unit.manage', 'Gerenciar vínculos de profissionais e unidades.'],
  ['professional.schedule.read', 'Consultar jornadas de profissionais.'],
  ['professional.schedule.manage', 'Gerenciar jornadas de profissionais.'],
  ['professional.unavailability.read', 'Consultar indisponibilidades de profissionais.'],
  ['professional.unavailability.manage', 'Gerenciar indisponibilidades de profissionais.'],
  ['customer.read', 'Consultar clientes.'],
  ['customer.create', 'Criar clientes.'],
  ['customer.update', 'Atualizar clientes.'],
  ['customer.status.manage', 'Ativar ou desativar clientes.'],
  ['calendar.read', 'Consultar agenda interna.'],
  ['availability.read', 'Consultar horários disponíveis.'],
  ['appointment.read', 'Consultar agendamentos.'],
  ['appointment.create', 'Criar agendamentos.'],
  ['appointment.update', 'Atualizar agendamentos.'],
  ['appointment.status.manage', 'Gerenciar status de agendamentos.'],
  ['appointment.fit_in.manage', 'Criar encaixes administrativos na agenda.'],
  ['appointment.checkin.manage', 'Registrar check-in de agendamentos na recepção.'],
  ['appointment.waitlist.read', 'Consultar lista de espera de agendamentos.'],
  ['appointment.waitlist.manage', 'Gerenciar oportunidades e conversões da lista de espera.'],
  ['professional.self.read', 'Consultar o próprio perfil profissional e a própria agenda.'],
  [
    'professional.self.update',
    'Atualizar os próprios atendimentos (observações e status permitido ao profissional).',
  ],
  ['notification.read', 'Consultar o log de notificações enviadas pelo estabelecimento.'],
  ['notification.template.manage', 'Personalizar os modelos de mensagens de notificação.'],
  ['product.read', 'Consultar categorias e produtos.'],
  ['product.manage', 'Gerenciar categorias e produtos.'],
  ['stock.read', 'Consultar estoque por unidade.'],
  ['stock.manage', 'Definir estoque por unidade.'],
  ['product_sale.read', 'Consultar vendas de produtos.'],
  ['product_sale.manage', 'Registrar vendas de produtos.'],
  ['payment.read', 'Consultar pagamentos registrados nos agendamentos.'],
  ['payment.manage', 'Registrar e cancelar pagamentos de agendamentos.'],
  ['cash.read', 'Consultar caixas, movimentações e saldo.'],
  ['cash.manage', 'Abrir e fechar caixa e registrar movimentações manuais.'],
  ['commission.read', 'Consultar comissões geradas a partir de pagamentos reais.'],
  ['financial_closing.read', 'Consultar fechamentos financeiros por período.'],
  ['financial_closing.manage', 'Realizar e cancelar fechamentos financeiros por período.'],
  ['financial_report.read', 'Consultar e exportar relatórios financeiros completos.'],
  ['payment_gateway.read', 'Consultar a configuração do gateway de pagamento.'],
  [
    'payment_gateway.manage',
    'Configurar o gateway de pagamento do estabelecimento, incluindo credenciais.',
  ],
  ['automation.read', 'Consultar automações e regras de recuperação de clientes.'],
  ['automation.manage', 'Configurar automações e regras de recuperação de clientes.'],
  ['coupon.read', 'Consultar cupons de desconto do estabelecimento.'],
  ['coupon.manage', 'Criar, atualizar e aplicar cupons de desconto.'],
  ['loyalty.read', 'Consultar regras e saldos de fidelidade (pontos e cashback).'],
  ['loyalty.manage', 'Configurar regras de fidelidade e resgatar pontos/cashback em agendamentos.'],
  ['integration.read', 'Consultar integrações externas do estabelecimento.'],
  ['integration.manage', 'Configurar integrações externas do estabelecimento.'],
  ['collection.read', 'Consultar dívidas e réguas de cobrança do estabelecimento.'],
  ['collection.manage', 'Criar, atualizar e administrar dívidas e réguas de cobrança.'],
] as const;

const roles = [
  {
    code: 'OWNER',
    name: 'Proprietário',
    description: 'Responsável principal pelo estabelecimento.',
    permissions: permissions.map(([code]) => code),
  },
  {
    code: 'MANAGER',
    name: 'Gerente',
    description: 'Gerencia a operação e os membros autorizados.',
    permissions: [
      'tenant.read',
      'tenant.update',
      'tenant.branding.read',
      'tenant.branding.manage',
      'tenant.subscription.read',
      'unit.read',
      'unit.create',
      'unit.update',
      'membership.read',
      'membership.invite',
      'membership.update',
      'membership.suspend',
      'role.read',
      'session.read_own',
      'session.revoke_own',
      'audit.read',
      'service.read',
      'service.create',
      'service.update',
      'service.status.manage',
      'service.image.manage',
      'service.category.read',
      'service.category.create',
      'service.category.update',
      'service.category.status.manage',
      'service.variation.read',
      'service.variation.manage',
      'combo.read',
      'combo.create',
      'combo.update',
      'combo.status.manage',
      'combo.image.manage',
      'professional.read',
      'professional.create',
      'professional.update',
      'professional.status.manage',
      'professional.image.manage',
      'professional.service.read',
      'professional.service.manage',
      'professional.unit.read',
      'professional.unit.manage',
      'professional.schedule.read',
      'professional.schedule.manage',
      'professional.unavailability.read',
      'professional.unavailability.manage',
      'customer.read',
      'customer.create',
      'customer.update',
      'customer.status.manage',
      'calendar.read',
      'availability.read',
      'appointment.read',
      'appointment.create',
      'appointment.update',
      'appointment.status.manage',
      'appointment.fit_in.manage',
      'appointment.checkin.manage',
      'appointment.waitlist.read',
      'appointment.waitlist.manage',
      'notification.read',
      'notification.template.manage',
      'product.read',
      'product.manage',
      'stock.read',
      'stock.manage',
      'product_sale.read',
      'product_sale.manage',
      'payment.read',
      'payment.manage',
      'cash.read',
      'cash.manage',
      'commission.read',
      'financial_closing.read',
      'financial_closing.manage',
      'financial_report.read',
      'payment_gateway.read',
      'automation.read',
      'automation.manage',
      'coupon.read',
      'coupon.manage',
      'loyalty.read',
      'loyalty.manage',
      'integration.read',
      'integration.manage',
      'collection.read',
      'collection.manage',
    ],
  },
  {
    code: 'RECEPTIONIST',
    name: 'Recepcionista',
    description: 'Opera a recepção: consulta agendamentos, registra check-in e recebe pagamentos.',
    permissions: [
      'tenant.read',
      'unit.read',
      'membership.read',
      'session.read_own',
      'session.revoke_own',
      'customer.read',
      'appointment.read',
      'appointment.waitlist.read',
      'appointment.checkin.manage',
      'payment.read',
      'payment.manage',
      'cash.read',
      'cash.manage',
      'coupon.read',
      'coupon.manage',
      'loyalty.read',
      'loyalty.manage',
    ],
  },
  {
    code: 'PROFESSIONAL',
    name: 'Profissional',
    description: 'Acessa somente informações básicas autorizadas.',
    permissions: [
      'tenant.read',
      'unit.read',
      'session.read_own',
      'session.revoke_own',
      'professional.self.read',
      'professional.self.update',
    ],
  },
] as const;

const platformPermissions = [
  ['platform.dashboard.read', 'Consultar o painel global.'],
  ['platform.tenant.read', 'Consultar estabelecimentos globalmente.'],
  ['platform.tenant.create', 'Provisionar estabelecimentos.'],
  ['platform.tenant.update', 'Atualizar dados administrativos de estabelecimentos.'],
  ['platform.tenant.status.manage', 'Gerenciar status operacional de estabelecimentos.'],
  ['platform.plan.read', 'Consultar planos comerciais.'],
  ['platform.plan.create', 'Criar planos comerciais.'],
  ['platform.plan.update', 'Atualizar planos comerciais.'],
  ['platform.plan.status.manage', 'Gerenciar status de planos comerciais.'],
  ['platform.subscription.read', 'Consultar assinaturas comerciais.'],
  ['platform.subscription.create', 'Criar assinaturas comerciais.'],
  ['platform.subscription.update', 'Atualizar assinaturas comerciais.'],
  ['platform.subscription.status.manage', 'Gerenciar status de assinaturas comerciais.'],
  ['platform.audit.read', 'Consultar auditoria global.'],
  ['platform.metrics.read', 'Consultar métricas globais.'],
  ['platform.commercial_policy.read', 'Consultar a política comercial global.'],
  ['platform.commercial_policy.manage', 'Gerenciar a política comercial global.'],
] as const;

async function bootstrap(): Promise<void> {
  const databaseUrl = buildDatabaseUrl(process.env);
  if (databaseUrl === undefined) {
    throw new Error(
      'Configuração de banco ausente: defina DATABASE_URL ou DB_NAME/DB_USER/DB_PASSWORD.',
    );
  }
  const client = createPrismaClient(databaseUrl);
  try {
    await client.$transaction(async (transaction) => {
      for (const [code, description] of permissions) {
        await transaction.permission.upsert({
          where: { code },
          create: { code, description },
          update: {},
        });
      }
      for (const roleDefinition of roles) {
        const role = await transaction.role.upsert({
          where: { code: roleDefinition.code },
          create: {
            publicId: crypto.randomUUID(),
            code: roleDefinition.code,
            name: roleDefinition.name,
            description: roleDefinition.description,
            isSystem: true,
          },
          update: {},
        });
        const rolePermissions = await transaction.permission.findMany({
          where: { code: { in: [...roleDefinition.permissions] } },
          select: { id: true },
        });
        await transaction.rolePermission.createMany({
          data: rolePermissions.map(({ id: permissionId }) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }
      for (const [code, description] of platformPermissions) {
        await transaction.platformPermission.upsert({
          where: { code },
          create: { code, description },
          update: {},
        });
      }
      const platformRole = await transaction.platformRole.upsert({
        where: { code: 'PLATFORM_ADMIN' },
        create: {
          code: 'PLATFORM_ADMIN',
          name: 'Administrador da plataforma',
          description: 'Administração global da plataforma.',
          isSystem: true,
        },
        update: {},
      });
      const globalPermissions = await transaction.platformPermission.findMany({
        where: { code: { in: platformPermissions.map(([code]) => code) } },
        select: { id: true },
      });
      await transaction.platformRolePermission.createMany({
        data: globalPermissions.map(({ id: permissionId }) => ({
          roleId: platformRole.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    });

    // Provisionamento idempotente do primeiro Super Admin durante o deploy,
    // quando PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD estão presentes. Cria o
    // usuário (senha só como hash argon2) se não existir e o promove a
    // PLATFORM_ADMIN; se já existir, não altera a senha. A senha nunca é logada.
    const adminEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim();
    const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD;
    if (
      adminEmail !== undefined &&
      adminEmail.length > 0 &&
      adminPassword !== undefined &&
      adminPassword.length > 0
    ) {
      const platform = new PlatformService(client);
      const passwords = new PasswordService({
        memoryCost: Number(process.env.PASSWORD_ARGON2_MEMORY_COST) || 65_536,
        timeCost: Number(process.env.PASSWORD_ARGON2_TIME_COST) || 3,
        parallelism: Number(process.env.PASSWORD_ARGON2_PARALLELISM) || 1,
      });
      const result = await platform.ensureInitialAdministrator({
        email: adminEmail,
        hashPassword: () => passwords.hash(adminPassword),
        metadata: { ipAddress: null, userAgent: 'bootstrap-platform-admin-provisioning' },
      });
      process.stdout.write(`Administrador da plataforma provisionado: ${result} (${adminEmail})\n`);
    }
  } finally {
    await client.$disconnect();
  }
}

await bootstrap();
