import { IconAlertCircle, IconCircleCheck, IconCloud, IconQrcode, IconRefresh, IconSwitch } from '@tabler/icons-react';

export function ConnectionStatusBanner({ state, provider, phone, lastCheck, onTest, onChange, disabled }: { state: string; provider: 'WAPI' | 'META'; phone: string; lastCheck: string; onTest: () => void; onChange: () => void; disabled?: boolean }) {
  const connected = state === 'CONNECTED';
  return <section className={`whatsapp-status-banner ${connected ? 'is-connected' : 'is-disconnected'}`} aria-label="Status da conexão">
    <div className="whatsapp-status-banner__indicator">{connected ? <IconCircleCheck size={28} /> : <IconAlertCircle size={28} />}</div>
    <div className="whatsapp-status-banner__content"><div className="whatsapp-status-banner__title"><strong>{connected ? 'WhatsApp conectado' : 'WhatsApp não conectado'}</strong><span className="whatsapp-status-badge">{connected ? 'CONECTADO' : 'ATENÇÃO'}</span></div>
      <div className="whatsapp-status-banner__facts"><span>{provider === 'META' ? <IconCloud size={15} /> : <IconQrcode size={15} />} {provider === 'META' ? 'Meta Cloud API' : 'API não oficial'}</span><span>Número: {phone || 'Não identificado'}</span><span>Verificado: {lastCheck || 'Ainda não verificado'}</span></div>
    </div><div className="whatsapp-status-banner__actions"><button className="secondary-button" type="button" onClick={onTest} disabled={disabled}><IconRefresh size={16} />Testar conexão</button><button className="text-button" type="button" onClick={onChange} disabled={disabled}><IconSwitch size={16} />Desconectar / alterar</button></div>
  </section>;
}
