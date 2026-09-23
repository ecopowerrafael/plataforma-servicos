import { PlatformFinanceOverviewSchema,PlatformSubscriptionBillingSchema } from '@plataforma/shared';
import { describe,expect,it } from 'vitest';

import { PixLocalProviderAdapter } from '../payments/gateway/pix-local.provider.js';

describe('platform subscription billing contracts',()=>{
  it('never exposes gateway secrets in the global overview',()=>{const result=PlatformFinanceOverviewSchema.parse({configs:[{provider:'mercadopago',active:true,environment:'PRODUCTION',hasCredentials:true,updatedAt:new Date().toISOString()}],manualActivationEnabled:true});expect(result.configs[0]).not.toHaveProperty('accessToken');expect(result.configs[0]).not.toHaveProperty('webhookSecret');});
  it('only exposes globally enabled methods to tenants',()=>{const result=PlatformSubscriptionBillingSchema.parse({methods:['pix-local'],manualActivationEnabled:false,latestCharge:null});expect(result.methods).toEqual(['pix-local']);expect(result.manualActivationEnabled).toBe(false);});
  it('generates a real static PIX payload using the existing provider',async()=>{const provider=new PixLocalProviderAdapter();const result=await provider.createCharge({key:'financeiro@agendei.site',receiverName:'AGENDEI',city:'SAO PAULO'},'PRODUCTION',{amountCents:7900n,currency:'BRL',description:'Assinatura',idempotencyKey:'platform:test'});expect(result.pixCopyPaste).toContain('br.gov.bcb.pix');expect(result.status).toBe('PENDING');});
  it('rejects unsupported public payment methods',()=>{expect(()=>PlatformSubscriptionBillingSchema.parse({methods:['manual'],manualActivationEnabled:false,latestCharge:null})).toThrow();});
});
