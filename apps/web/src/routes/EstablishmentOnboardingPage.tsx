import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { AuthLayout } from '../components/AuthLayout.js';
import { httpClient } from '../lib/http.js';
import { selectTenant } from '../lib/tenant-selection.js';
const key='agendei.signupIntent.v1';
export function EstablishmentOnboardingPage(){const [name,setName]=useState('');const [busy,setBusy]=useState(false);const navigate=useNavigate();const submit=async(e:FormEvent)=>{e.preventDefault();if(busy||name.trim().length<2)return;setBusy(true);try{const intent=JSON.parse(sessionStorage.getItem(key)??'{}') as {planPublicId?:string;billingCycle?:string};const result=await httpClient.request('/auth/onboarding',{method:'POST',body:{name,planPublicId:intent.planPublicId,billingCycle:intent.billingCycle},schema:z.object({tenantPublicId:z.uuid()})});selectTenant(result.tenantPublicId);sessionStorage.removeItem(key);await navigate('/app');}finally{setBusy(false);}};return <AuthLayout title="Agora vamos configurar seu negócio" description="Como se chama seu estabelecimento?"><form className="auth-form" onSubmit={e=>void submit(e)}><label>Nome do estabelecimento<input autoFocus placeholder="Ex.: Barbearia Imperial" value={name} onChange={e=>setName(e.target.value)}/></label><button className="primary-button" disabled={busy||name.trim().length<2}>{busy?'Criando…':'Continuar'}</button></form></AuthLayout>;}
