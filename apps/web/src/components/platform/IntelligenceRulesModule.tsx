import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';


interface Rule { publicId: string; name: string; intent: string; enabled: boolean; priority: number; baseConfidence: number | string; patterns: { pattern: string }[] }

export function IntelligenceRulesModule() {
  const [text, setText] = useState('quero fazer limpeza dental com Ana amanhã às 15');
  const [name, setName] = useState('');
  const [pattern, setPattern] = useState('');
  const rules = useQuery({ queryKey: ['platform', 'intelligence-rules'], queryFn: () => httpClient.request<{ items: Rule[]; tags: string[] }>('/platform/intelligence/rules', { schema: z.any() }) });
  const simulation = useQuery({ queryKey: ['platform', 'intelligence-simulator', text], queryFn: () => httpClient.request<{ intent: string; rule: string | null; pattern: string | null; confidence: number; entities: { tag: string; value: string }[]; patternsConsidered: string[] }>('/platform/intelligence/simulator', { method: 'POST', body: { text }, schema: z.any() }), enabled: false });
  const createRule = useMutation({ mutationFn: () => httpClient.request('/platform/intelligence/rules', { method: 'POST', body: { name, intent: 'BOOKING', baseConfidence: 0.65, patterns: [pattern] }, schema: z.any() }), onSuccess: () => { setName(''); setPattern(''); void rules.refetch(); } });
  return <section><header className="platform-page-header"><div><p className="platform-eyebrow">INTELIGÊNCIA</p><h1>Regras de interpretação</h1><p>Estruturas globais combinadas com o catálogo real de cada tenant.</p></div></header><div className="platform-panel"><h2>Nova regra</h2><input aria-label="Nome da regra" placeholder="Nome da regra" value={name} onChange={(event) => { setName(event.target.value); }} /><input aria-label="Pattern" placeholder="quero {SERVICE}" value={pattern} onChange={(event) => { setPattern(event.target.value); }} /><small>Tags: {rules.data?.tags.join(', ') ?? '{SERVICE}, {COMBO}, {PROFESSIONAL}, {DATE}, {TIME}, {DAY_PERIOD}, {PAYMENT_METHOD}'}</small><button type="button" disabled={!name || !pattern || createRule.isPending} onClick={() => { createRule.mutate(); }}>Criar regra</button></div><div className="platform-panel"><h2>Regras cadastradas</h2>{rules.isPending ? <p>Carregando…</p> : rules.error ? <p role="alert">Não foi possível carregar as regras.</p> : rules.data.items.map((rule) => <article key={rule.publicId} style={{ display: 'grid', gap: 4, padding: '12px 0', borderBottom: '1px solid var(--border-color, #ddd)' }}><strong>{rule.name}</strong><span>{rule.intent} · prioridade {rule.priority} · confidence {rule.baseConfidence}</span><span>{rule.enabled ? 'Ativa' : 'Inativa'} · {rule.patterns.length} patterns</span></article>)}</div><div className="platform-panel"><h2>Testar interpretação</h2><textarea value={text} onChange={(event) => { setText(event.target.value); }} rows={3} /><button type="button" onClick={() => { void simulation.refetch(); }}>Testar</button>{simulation.data ? <div role="status"><p><strong>Intent:</strong> {simulation.data.intent}</p><p><strong>Regra:</strong> {simulation.data.rule ?? 'nenhuma'}</p><p><strong>Pattern:</strong> {simulation.data.pattern ?? 'nenhum'}</p><p><strong>Confidence:</strong> {simulation.data.confidence}</p><p><strong>Entidades:</strong> {simulation.data.entities.map((entity) => `${entity.tag}: ${entity.value}`).join(', ') || 'nenhuma'}</p></div> : null}</div></section>;
}
