const dependencies = ['STRIPE_TEST_SECRET_KEY', 'MERCADOPAGO_TEST_ACCESS_TOKEN', 'WAPI_TEST_BASE_URL', 'META_TEST_ACCESS_TOKEN', 'SMTP_TEST_HOST', 'PUSH_TEST_ENDPOINT'];
const configured = dependencies.filter((name) => process.env[name]);
if (configured.length === 0) {
  console.log(JSON.stringify({ suite: 'integration:external', status: 'skipped', reason: 'nenhuma dependência externa de teste configurada', dependencies }));
  process.exit(0);
}
console.error(`Dependências externas configuradas (${configured.join(', ')}), mas o runner externo ainda requer um ambiente dedicado.`);
process.exit(2);
