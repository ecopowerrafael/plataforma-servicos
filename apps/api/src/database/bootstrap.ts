import { createPrismaClient } from './connection.js';
import { loadEnvironment } from '../config/environment.js';

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
    ],
  },
  {
    code: 'RECEPTIONIST',
    name: 'Recepcionista',
    description: 'Opera a recepção: consulta agendamentos e registra check-in dos clientes.',
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
] as const;

async function bootstrap(): Promise<void> {
  const environment = loadEnvironment();
  const client = createPrismaClient(environment.DATABASE_URL);
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
  } finally {
    await client.$disconnect();
  }
}

await bootstrap();
