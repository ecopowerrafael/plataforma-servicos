import { IconBriefcase2, IconBuildingStore, IconCoins, IconLayoutDashboard, IconUsersGroup, IconWallet } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { httpClient, HttpError } from '../../lib/http.js';
import { ErrorState } from '../platform/PlatformUi.js';
import { CommercialDashboardTab } from './CommercialDashboardTab.js';
import { CommercialClientsTab } from './CommercialClientsTab.js';
import { CommercialTeamTab } from './CommercialTeamTab.js';
import { WalletTab } from './WalletTab.js';
import { CommissionsTab } from './CommissionsTab.js';

type CommercialTab = 'dashboard' | 'clients' | 'team' | 'wallet' | 'commissions';
const tabs: Array<{ id: CommercialTab; label: string; icon: typeof IconLayoutDashboard }> = [
  { id: 'dashboard', label: 'Visão geral', icon: IconLayoutDashboard }, { id: 'wallet', label: 'Carteira', icon: IconWallet }, { id: 'commissions', label: 'Comissões', icon: IconCoins }, { id: 'clients', label: 'Clientes', icon: IconBuildingStore }, { id: 'team', label: 'Equipe', icon: IconUsersGroup },
];
const roleLabels: Record<string, string> = { MANAGER: 'Gerente comercial', REPRESENTATIVE: 'Representante comercial', SELLER: 'Consultor comercial' };

export function CommercialManagerModule() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: CommercialTab = location.pathname.includes('carteira') ? 'wallet' : location.pathname.includes('comissoes') ? 'commissions' : location.pathname.includes('clientes') ? 'clients' : location.pathname.includes('equipe') ? 'team' : 'dashboard';
  const handleTabChange = (tab: CommercialTab) => navigate({ dashboard: '/comercial/dashboard', wallet: '/comercial/carteira', commissions: '/comercial/comissoes', clients: '/comercial/clientes', team: '/comercial/equipe' }[tab]);
  const me = useQuery({ queryKey: ['commercial', 'me'], queryFn: () => httpClient.request('/commercial/me', { schema: z.object({ publicId: z.string(), email: z.string(), role: z.string(), active: z.boolean(), defaultCommissionBps: z.number() }) }), retry: false });
  const deniedStatus = me.error instanceof HttpError ? me.error.status : undefined;
  if (deniedStatus === 403) return <ErrorState message="Você não tem acesso ao painel comercial" />;
  if (me.isPending) return <div className="commercial-loading"><div /><div /></div>;
  if (me.error instanceof Error || me.data === undefined) return <ErrorState message="Erro ao carregar dados comerciais" />;
  const account = me.data;
  const roleLabel = roleLabels[account.role] ?? 'Profissional comercial';
  const commission = `${(account.defaultCommissionBps / 100).toFixed(2).replace('.', ',')}%`;
  return <div className="commercial-shell">
    <header className="commercial-header"><div className="commercial-header-inner">
      <button className="commercial-brand" type="button" onClick={() => handleTabChange('dashboard')} aria-label="Agendei Comercial — início"><img src="/brand/logo-agendei.png" alt="Agendei" /></button>
      <div className="commercial-header-divider" /><div className="commercial-header-title"><IconBriefcase2 size={17} /> Comercial</div>
      <div className="commercial-profile"><span className={`commercial-profile-status ${account.active ? 'active' : 'inactive'}`} /><div><strong>{roleLabel}</strong><span>{account.email}</span></div></div>
    </div></header>
    <main className="commercial-workspace">
      <section className="commercial-welcome"><div><p className="commercial-eyebrow">ÁREA COMERCIAL</p><h1>Seu espaço para acompanhar resultados e oportunidades.</h1><p>Organize sua carteira, acompanhe comissões e mantenha sua operação comercial em movimento.</p></div><div className="commercial-account-card"><span>Comissão padrão</span><strong>{commission}</strong><small>{account.active ? 'Conta ativa e pronta para operar' : 'Conta temporariamente inativa'}</small></div></section>
      <nav className="commercial-tabs" aria-label="Navegação comercial">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={`commercial-tab ${activeTab === id ? 'active' : ''}`} onClick={() => handleTabChange(id)}><Icon size={18} stroke={1.8} />{label}</button>)}</nav>
      <div className="commercial-content">{activeTab === 'dashboard' && <CommercialDashboardTab role={account.role} />}{activeTab === 'wallet' && <WalletTab />}{activeTab === 'commissions' && <CommissionsTab />}{activeTab === 'clients' && <CommercialClientsTab />}{activeTab === 'team' && <CommercialTeamTab role={account.role} />}</div>
    </main>
    <style>{`
      .commercial-shell{min-height:100vh;background:#f7f8fa;color:#172033}.commercial-header{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.96);border-bottom:1px solid #e7eaf0;backdrop-filter:blur(14px)}.commercial-header-inner{max-width:1360px;min-height:72px;padding:0 28px;margin:0 auto;display:flex;align-items:center;gap:18px}.commercial-brand{padding:0;border:0;background:transparent;cursor:pointer;display:flex}.commercial-brand img{display:block;width:auto;height:33px;max-width:158px;object-fit:contain}.commercial-header-divider{width:1px;height:26px;background:#dfe4ec}.commercial-header-title{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:#586174;letter-spacing:.02em}.commercial-profile{display:flex;align-items:center;gap:10px;margin-left:auto;min-width:0}.commercial-profile-status{width:9px;height:9px;border-radius:99px;flex:0 0 auto}.commercial-profile-status.active{background:#20a66a;box-shadow:0 0 0 4px #e3f7ed}.commercial-profile-status.inactive{background:#d35a5a;box-shadow:0 0 0 4px #fdeaea}.commercial-profile strong,.commercial-profile span:not(.commercial-profile-status){display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.commercial-profile strong{max-width:210px;font-size:12px;color:#2a3345}.commercial-profile span:not(.commercial-profile-status){max-width:210px;margin-top:2px;font-size:12px;color:#8790a0}
      .commercial-workspace{max-width:1360px;padding:36px 28px 56px;margin:0 auto}.commercial-welcome{display:flex;align-items:stretch;justify-content:space-between;gap:28px;padding:34px 38px;border-radius:20px;color:#fff;background:radial-gradient(circle at 82% -10%,#4675c7 0,transparent 34%),linear-gradient(118deg,#172541 0%,#223b68 55%,#285081 100%);box-shadow:0 18px 40px rgba(23,37,65,.18)}.commercial-welcome>div:first-child{max-width:720px}.commercial-eyebrow{margin:0 0 10px;color:#b9d4ff;font-size:11px;font-weight:800;letter-spacing:.14em}.commercial-welcome h1{max-width:670px;margin:0;font-size:clamp(24px,3vw,34px);line-height:1.15;letter-spacing:-.025em}.commercial-welcome p:not(.commercial-eyebrow){margin:13px 0 0;color:#d6e3f8;max-width:610px;font-size:15px;line-height:1.55}.commercial-account-card{flex:0 0 210px;display:flex;flex-direction:column;justify-content:center;padding:20px 22px;border:1px solid rgba(255,255,255,.2);border-radius:14px;background:rgba(255,255,255,.1)}.commercial-account-card span{color:#cfddf5;font-size:12px;font-weight:600}.commercial-account-card strong{margin:3px 0 10px;font-size:30px;letter-spacing:-.035em}.commercial-account-card small{color:#c5d8f4;font-size:11px;line-height:1.4}
      .commercial-tabs{display:flex;gap:8px;margin:28px 0 24px;padding:7px;overflow-x:auto;border:1px solid #e5e9f0;border-radius:14px;background:#fff;box-shadow:0 3px 12px rgba(33,47,71,.04)}.commercial-tab{display:flex;align-items:center;justify-content:center;gap:8px;padding:11px 14px;border:0;border-radius:9px;background:transparent;color:#687286;font:inherit;font-size:13px;font-weight:650;white-space:nowrap;cursor:pointer;transition:background .18s,color .18s,box-shadow .18s}.commercial-tab:hover{color:#1f3d6d;background:#f2f6fc}.commercial-tab.active{color:#fff;background:#24477e;box-shadow:0 4px 9px rgba(36,71,126,.2)}.commercial-content{min-width:0}.commercial-loading{padding:40px}.commercial-loading div{height:20px;margin-bottom:12px;border-radius:6px;background:#e8ecf2;animation:commercial-pulse 1.6s infinite}@keyframes commercial-pulse{50%{opacity:.45}}@media(max-width:700px){.commercial-header-inner{min-height:62px;padding:0 18px;gap:12px}.commercial-brand img{height:28px}.commercial-header-divider,.commercial-header-title{display:none}.commercial-profile strong,.commercial-profile span:not(.commercial-profile-status){max-width:170px}.commercial-workspace{padding:22px 16px 42px}.commercial-welcome{display:block;padding:26px 24px;border-radius:16px}.commercial-account-card{margin-top:24px}.commercial-tabs{margin:20px 0}.commercial-tab{padding:10px 12px}}
    `}</style>
  </div>;
}
