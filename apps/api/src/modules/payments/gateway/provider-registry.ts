import { type PaymentGatewayProviderAdapter } from './provider.js';

/**
 * Registro de provedores de gateway suportados. Em produção (ver connection.ts), este
 * registro é criado vazio — nenhum fornecedor foi escolhido ainda pelo projeto, então
 * nenhum adapter fake/simulado é registrado. Quando um provedor real for definido, seu
 * adapter deve ser implementado (satisfazendo PaymentGatewayProviderAdapter) e registrado
 * aqui na composição real da aplicação.
 */
export class PaymentGatewayProviderRegistry {
  private readonly adapters = new Map<string, PaymentGatewayProviderAdapter>();

  public register(adapter: PaymentGatewayProviderAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  public get(name: string): PaymentGatewayProviderAdapter | undefined {
    return this.adapters.get(name);
  }
}
