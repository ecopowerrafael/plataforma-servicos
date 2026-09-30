/* eslint-disable import-x/order, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/restrict-template-expressions, @typescript-eslint/prefer-nullish-coalescing */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { httpClient } from "../../../../lib/http.js";
import {
  IconBook2,
  IconCheck,
  IconMessageCircle,
  IconPlayerPlay,
  IconTag,
} from "@tabler/icons-react";
import { SectionCard, StatCard, StatGrid, StatusBadge } from "../../../../components/ui/AppUi.js";

const intents = [
  ["BOOKING", "Agendamento"],
  ["AVAILABILITY", "Consultar horários"],
  ["PRICE_QUERY", "Consulta de preço"],
  ["PAYMENT_METHODS", "Formas de pagamento"],
  ["PAYMENT", "Pagamento"],
  ["CANCEL", "Cancelamento"],
  ["RESCHEDULE", "Reagendamento"],
  ["BOOKING_QUERY", "Consultar agendamento"],
] as const;
const tags = [
  "{SERVICE}",
  "{COMBO}",
  "{PROFESSIONAL}",
  "{DATE}",
  "{TIME}",
  "{DAY_PERIOD}",
  "{PAYMENT_METHOD}",
];
const tagLabels: Record<string, string> = {
  SERVICE: "Serviço",
  COMBO: "Combo",
  PROFESSIONAL: "Profissional",
  DATE: "Data",
  TIME: "Horário",
  DAY_PERIOD: "Período do dia",
  PAYMENT_METHOD: "Forma de pagamento",
};
const intentDescriptions: Record<string, string> = {
  BOOKING: "Quando o cliente quer marcar um horário.",
  AVAILABILITY: "Quando o cliente quer saber se existe vaga.",
  PRICE_QUERY: "Quando o cliente quer saber quanto custa.",
  PAYMENT_METHODS: "Quando o cliente pergunta como pode pagar.",
  PAYMENT: "Quando o cliente quer pagar ou receber instruções.",
  CANCEL: "Quando o cliente quer cancelar um horário.",
  RESCHEDULE: "Quando o cliente quer trocar o dia ou horário.",
  BOOKING_QUERY: "Quando o cliente quer saber quando está marcado.",
};
const friendlyPattern = (value: string) =>
  value.replace(
    /\{([A-Z_]+)\}/g,
    (_, tag: string) => `[${tagLabels[tag] ?? tag}]`,
  );
const typeLabel: Record<string, string> = {
  SERVICE: "Serviço",
  COMBO: "Combo",
  PROFESSIONAL: "Profissional",
};
const fieldLabel: Record<string, string> = {
  SERVICE: "Serviço",
  COMBO: "Combo",
  PROFESSIONAL: "Profissional",
  DATE: "Data",
  TIME: "Horário",
  DAY_PERIOD: "Período",
  PAYMENT_METHOD: "Pagamento",
};
const responseSchema = z.object({
  services: z.array(z.object({ publicId: z.string(), name: z.string() })),
  combos: z.array(z.object({ publicId: z.string(), name: z.string() })),
  professionals: z.array(z.object({ publicId: z.string(), name: z.string() })),
  aliases: z.array(
    z.object({
      publicId: z.string(),
      entityType: z.string(),
      entityPublicId: z.string(),
      alias: z.string(),
    }),
  ),
  patterns: z.array(
    z.object({
      publicId: z.string(),
      intent: z.string(),
      pattern: z.string(),
      enabled: z.boolean(),
    }),
  ),
  rules: z.array(
    z.object({
      intent: z.string(),
      patterns: z.array(
        z.object({ publicId: z.string(), pattern: z.string() }),
      ),
    }),
  ),
});
const testSchema = z.object({
  intent: z.string(),
  pattern: z.string().nullable(),
  source: z.enum(["TENANT_TRAINING", "PLATFORM"]),
  confidence: z.number(),
  entities: z.array(
    z.object({
      tag: z.string(),
      value: z.string(),
      entity: z.unknown().nullable(),
    }),
  ),
  missingFields: z.array(z.string()),
  ambiguousEntities: z.array(z.string()),
});
type Section = "overview" | "vocabulary" | "training" | "test";

export function IntelligenceTab({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const client = useQueryClient();
  const [section, setSection] = useState<Section>("overview");
  const [selected, setSelected] = useState("");
  const [alias, setAlias] = useState("");
  const [intent, setIntent] = useState("BOOKING");
  const [pattern, setPattern] = useState("");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [aliasSearch, setAliasSearch] = useState("");
  const [aliasType, setAliasType] = useState("ALL");
  const [editingAlias, setEditingAlias] = useState<string | null>(null);
  const queryKey = ["tenant", tenantPublicId, "whatsapp-intelligence"];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request(
        "/tenant/integrations/whatsapp/assistant-config/intelligence",
        { schema: responseSchema, tenantPublicId },
      ),
  });
  const refresh = () => client.invalidateQueries({ queryKey });
  const addAlias = useMutation({
    mutationFn: () => {
      const [entityType, entityPublicId] = selected.split(":");
      return httpClient.request(
        "/tenant/integrations/whatsapp/assistant-config/intelligence/aliases",
        {
          method: "POST",
          body: { entityType, entityPublicId, alias },
          schema: z.unknown(),
          tenantPublicId,
        },
      );
    },
    onSuccess: async () => {
      setAlias("");
      await refresh();
    },
  });
  const updateAlias = useMutation({
    mutationFn: ({
      publicId,
      alias: value,
    }: {
      publicId: string;
      alias: string;
    }) =>
      httpClient.request(
        `/tenant/integrations/whatsapp/assistant-config/intelligence/aliases/${publicId}`,
        {
          method: "PATCH",
          body: { alias: value },
          schema: z.unknown(),
          tenantPublicId,
        },
      ),
    onSuccess: async () => {
      setEditingAlias(null);
      await refresh();
    },
  });
  const removeAlias = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(
        `/tenant/integrations/whatsapp/assistant-config/intelligence/aliases/${publicId}`,
        { method: "DELETE", schema: z.unknown(), tenantPublicId },
      ),
    onSuccess: refresh,
  });
  const addPattern = useMutation({
    mutationFn: () =>
      httpClient.request(
        "/tenant/integrations/whatsapp/assistant-config/intelligence/patterns",
        {
          method: "POST",
          body: { intent, pattern },
          schema: z.unknown(),
          tenantPublicId,
        },
      ),
    onSuccess: async () => {
      setPattern("");
      await refresh();
    },
  });
  const updatePattern = useMutation({
    mutationFn: ({
      publicId,
      body,
    }: {
      publicId: string;
      body: { pattern?: string; enabled?: boolean };
    }) =>
      httpClient.request(
        `/tenant/integrations/whatsapp/assistant-config/intelligence/patterns/${publicId}`,
        { method: "PATCH", body, schema: z.unknown(), tenantPublicId },
      ),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const removePattern = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(
        `/tenant/integrations/whatsapp/assistant-config/intelligence/patterns/${publicId}`,
        { method: "DELETE", schema: z.unknown(), tenantPublicId },
      ),
    onSuccess: refresh,
  });
  const simulation = useMutation({
    mutationFn: () =>
      httpClient.request(
        "/tenant/integrations/whatsapp/assistant-config/intelligence/simulator",
        { method: "POST", body: { text }, schema: testSchema, tenantPublicId },
      ),
  });
  if (query.isPending)
    return (
      <section className="wa-card wa-intelligence-loading">
        Carregando inteligência…
      </section>
    );
  if (query.isError || !query.data)
    return (
      <section className="wa-card wa-intelligence-loading">
        Não foi possível carregar o vocabulário do tenant.
      </section>
    );
  const data = query.data;
  const entities = [
    ...data.services.map((item) => ({ ...item, type: "SERVICE" })),
    ...data.combos.map((item) => ({ ...item, type: "COMBO" })),
    ...data.professionals.map((item) => ({ ...item, type: "PROFESSIONAL" })),
  ];
  const entityByKey = new Map(
    entities.map((item) => [`${item.type}:${item.publicId}`, item]),
  );
  const filteredAliases = data.aliases.filter((item) => {
    const entity = entityByKey.get(`${item.entityType}:${item.entityPublicId}`);
    const needle = aliasSearch.trim().toLocaleLowerCase();
    return (
      (aliasType === "ALL" || item.entityType === aliasType) &&
      (!needle ||
        item.alias.toLocaleLowerCase().includes(needle) ||
        entity?.name.toLocaleLowerCase().includes(needle))
    );
  });
  const customPatterns = data.patterns.filter((item) => item.enabled);
  const intelligenceConfigured = data.aliases.length > 0 || customPatterns.length > 0;
  const nextStep = data.aliases.length === 0
    ? { title: "Ensine como seus clientes chamam os serviços", description: "Por exemplo: “cabelinho” pode significar “Corte”. Isso ajuda o assistente a entender jeitos diferentes de falar.", label: "Adicionar nome alternativo", section: "vocabulary" as Section, icon: <IconTag size={22} aria-hidden="true" /> }
    : customPatterns.length === 0
      ? { title: "Agora ensine uma frase comum", description: "Mostre ao Agendei uma forma diferente que seus clientes usam para pedir um horário, cancelar ou perguntar um preço.", label: "Ensinar uma frase", section: "training" as Section, icon: <IconMessageCircle size={22} aria-hidden="true" /> }
      : { title: "Teste o que o assistente aprendeu", description: "Digite uma mensagem como se fosse um cliente e confira se o resultado está correto.", label: "Testar uma mensagem", section: "test" as Section, icon: <IconPlayerPlay size={22} aria-hidden="true" /> };
  const tabs = [
    ["overview", "Visão geral"],
    ["vocabulary", "Nomes alternativos"],
    ["training", "Frases ensinadas"],
    ["test", "Testar mensagem"],
  ] as const;
  return (
    <section className="wa-card wa-intelligence-card">
      <nav className="wa-tabs" aria-label="Inteligência do tenant">
        {tabs.map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={section === id ? "is-active" : ""}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {section === "overview" && (
        <div className="wa-intelligence-content wa-overview-dashboard">
          <section className="wa-overview-hero" aria-labelledby="wa-overview-title">
            <div>
              <span className="wa-kicker">ASSISTENTE INTELIGENTE</span>
              <h2 id="wa-overview-title">{intelligenceConfigured ? "Seu assistente já está aprendendo com o seu negócio" : "Comece ensinando como seus clientes costumam falar"}</h2>
              <p>Cadastre nomes diferentes para seus serviços, ensine frases comuns e teste como o Agendei vai entender cada mensagem.</p>
              <div className="wa-overview-hero-actions">
                <button type="button" className="wa-primary-action" onClick={() => setSection("test")}><IconPlayerPlay size={16} aria-hidden="true" /> Testar uma mensagem</button>
                <button type="button" className="wa-secondary-button" onClick={() => setSection("training")}><IconMessageCircle size={16} aria-hidden="true" /> Ensinar uma frase</button>
              </div>
            </div>
            <div className="wa-overview-status" role="status"><span className="wa-overview-status-icon"><IconCheck size={22} aria-hidden="true" /></span><StatusBadge tone={intelligenceConfigured ? "success" : "info"}>{intelligenceConfigured ? "Personalizado" : "Configuração inicial"}</StatusBadge><strong>{intelligenceConfigured ? "Seu contexto já está sendo usado" : "Dê o primeiro passo"}</strong><small>{intelligenceConfigured ? "O assistente já usa informações específicas deste estabelecimento." : "Ensine pelo menos um nome ou frase para personalizar o atendimento."}</small></div>
          </section>
          <StatGrid>
            <div className="wa-overview-stat"><IconTag size={19} aria-hidden="true" /><StatCard label="Nomes alternativos" value={String(data.aliases.length)} hint="Jeitos diferentes de chamar serviços e profissionais." tone="info" /></div>
            <div className="wa-overview-stat"><IconMessageCircle size={19} aria-hidden="true" /><StatCard label="Frases ensinadas" value={String(customPatterns.length)} hint="Frases personalizadas que você ensinou." tone="muted" /></div>
            <div className="wa-overview-stat"><IconBook2 size={19} aria-hidden="true" /><StatCard label="Tipos de atendimento" value={String(intents.length)} hint="Agendar, remarcar, cancelar e outras ações." tone="success" /></div>
            <button type="button" className="wa-overview-stat wa-overview-stat-action" onClick={() => setSection("test")}><IconPlayerPlay size={19} aria-hidden="true" /><StatCard label="Último passo" value="Testar" hint="Confira se o assistente entende suas frases." tone="warning" /></button>
          </StatGrid>
          <section className="wa-recommended-step"><div className="wa-recommended-icon">{nextStep.icon}</div><div><span className="wa-kicker">PRÓXIMO PASSO RECOMENDADO</span><h2>{nextStep.title}</h2><p>{nextStep.description}</p></div><button type="button" className="wa-primary-action" onClick={() => setSection(nextStep.section)}>{nextStep.label} →</button></section>
          <SectionCard title="Como funciona" description="Configure em três passos simples." className="wa-how-it-works-new"><div className="wa-overview-steps"><article><span>01</span><IconTag size={20} aria-hidden="true" /><h3>Ensine os nomes</h3><p>Diga como seus clientes costumam chamar serviços, combos e profissionais.</p><small>cabelinho → Corte</small></article><article><span>02</span><IconMessageCircle size={20} aria-hidden="true" /><h3>Ensine as frases</h3><p>Mostre jeitos diferentes que seus clientes usam para pedir alguma coisa.</p><small>queria cortar amanhã</small></article><article><span>03</span><IconPlayerPlay size={20} aria-hidden="true" /><h3>Teste antes de usar</h3><p>Digite uma mensagem e veja exatamente o que o Agendei entendeu.</p><small>Serviço: Corte · Data: amanhã</small></article></div></SectionCard>
          <section className="wa-quick-actions"><div><span className="wa-kicker">ATALHOS</span><h2>Ações rápidas</h2></div><div className="wa-quick-action-grid"><button type="button" onClick={() => setSection("vocabulary")}><IconTag size={18} aria-hidden="true" /><strong>Adicionar nome alternativo</strong><small>Ensine outro jeito de chamar um item.</small></button><button type="button" onClick={() => setSection("training")}><IconMessageCircle size={18} aria-hidden="true" /><strong>Ensinar nova frase</strong><small>Mostre como seu cliente costuma pedir.</small></button><button type="button" onClick={() => setSection("test")}><IconPlayerPlay size={18} aria-hidden="true" /><strong>Testar uma mensagem</strong><small>Veja o que o assistente entendeu.</small></button></div></section>
        </div>
      )}
      {section === "vocabulary" && (
        <div className="wa-intelligence-content">
          <div className="wa-section-heading">
            <div>
              <span className="wa-kicker">NOMES ALTERNATIVOS</span>
              <h2>Nomes alternativos</h2>
              <p>
                “Cabelinho”, “corte” e “cortar o cabelo” podem significar o
                mesmo serviço.
              </p>
            </div>
            <span className="wa-status-badge">
              {data.aliases.length} cadastrados
            </span>
          </div>
          <div className="wa-card wa-vocabulary-form">
            <div className="wa-section-heading">
              <div>
                <h2>Adicionar nome alternativo</h2>
                <p>
                  Escolha um item e diga como seus clientes costumam chamar.
                </p>
              </div>
            </div>
            <div className="wa-form-grid">
              <label>
                Buscar nome
                <input
                  value={aliasSearch}
                  placeholder="Ex.: cabelo, João…"
                  onChange={(event) => setAliasSearch(event.target.value)}
                />
              </label>
              <label>
                Tipo
                <select
                  value={aliasType}
                  onChange={(event) => setAliasType(event.target.value)}
                >
                  <option value="ALL">Todos os tipos</option>
                  <option value="SERVICE">Serviços</option>
                  <option value="COMBO">Combos</option>
                  <option value="PROFESSIONAL">Profissionais</option>
                </select>
              </label>
              <label>
                Item real
                <select
                  value={selected}
                  disabled={!canManage}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  <option value="">Escolha um item</option>
                  {entities.map((item) => (
                    <option
                      key={`${item.type}:${item.publicId}`}
                      value={`${item.type}:${item.publicId}`}
                    >
                      {typeLabel[item.type]} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nome que o cliente usa
                <input
                  value={alias}
                  disabled={!canManage || !selected}
                  placeholder="Ex.: cabelinho"
                  onChange={(event) => setAlias(event.target.value)}
                />
              </label>
              <button
                className="wa-primary-action"
                type="button"
                disabled={!canManage || !selected || !alias.trim()}
                onClick={() => addAlias.mutate()}
              >
                + Adicionar
              </button>
            </div>
          </div>
          <div className="wa-table-wrap">
            <table className="wa-table">
              <thead>
                <tr>
                  <th>Nome usado pelo cliente</th>
                  <th>O que isso significa</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredAliases.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="wa-empty-state">
                        <span>⌕</span>
                        <strong>Nenhum nome encontrado</strong>
                        <small>
                          Tente mudar os filtros ou adicione o primeiro nome
                          alternativo.
                        </small>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAliases.map((item) => {
                    const entity = entityByKey.get(
                      `${item.entityType}:${item.entityPublicId}`,
                    );
                    return (
                      <tr key={item.publicId}>
                        <td>
                          {editingAlias === item.publicId ? (
                            <input
                              className="wa-inline-input"
                              autoFocus
                              defaultValue={item.alias}
                              onBlur={(event) =>
                                updateAlias.mutate({
                                  publicId: item.publicId,
                                  alias: event.target.value,
                                })
                              }
                            />
                          ) : (
                            <strong>{item.alias}</strong>
                          )}
                        </td>
                        <td>{entity?.name ?? "Item não encontrado"}</td>
                        <td>
                          <span
                            className={`wa-badge wa-badge-${item.entityType.toLowerCase()}`}
                          >
                            {typeLabel[item.entityType] ?? "Item"}
                          </span>
                        </td>
                        <td>
                          <span className="wa-badge wa-badge-success">
                            Ativo
                          </span>
                        </td>
                        <td>
                          <div className="wa-row-actions">
                            {canManage && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setEditingAlias(item.publicId)}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="is-danger"
                                  onClick={() =>
                                    removeAlias.mutate(item.publicId)
                                  }
                                >
                                  Excluir
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {section === "training" && (
        <div className="wa-intelligence-content">
          <div className="wa-section-heading">
            <div>
              <span className="wa-kicker">FRASES ENSINADAS</span>
              <h2>Frases ensinadas</h2>
              <p>
                Ensine novas formas de pedir agendamentos, preços, cancelamentos
                e outras ações.
              </p>
            </div>
          </div>
          <div className="wa-training-list">
            {intents.map(([key, label], index) => {
              const rule = data.rules.find((item) => item.intent === key);
              const custom = data.patterns.filter(
                (item) => item.intent === key,
              );
              return (
                <details
                  className="wa-training-card"
                  key={key}
                  open={index === 0}
                >
                  <summary>
                    <span className={`wa-intent-number tone-${index % 3}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>{label}</strong>
                      <small>
                        {intentDescriptions[key]} · {rule?.patterns.length ?? 0}{" "}
                        frases já entendidas · {custom.length} frases ensinadas
                      </small>
                    </span>
                    <b>⌄</b>
                  </summary>
                  <div className="wa-training-body">
                    <div className="wa-pattern-column">
                      <div className="wa-subsection-title">
                        <span>Frases que o Agendei já entende</span>
                        <span className="wa-badge wa-badge-neutral">
                          Automático
                        </span>
                      </div>
                      <small className="wa-muted">
                        Essas frases já funcionam e não precisam ser alteradas.
                      </small>
                      <div className="wa-pattern-list">
                        {rule?.patterns.map((item) => (
                          <div key={item.publicId}>
                            <span>{friendlyPattern(item.pattern)}</span>
                            <small>Pronto para usar</small>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="wa-pattern-column">
                      <div className="wa-subsection-title">
                        <span>Frases que você quer ensinar</span>
                        <span className="wa-badge wa-badge-success">
                          Editável
                        </span>
                      </div>
                      <small className="wa-muted">
                        Adicione jeitos diferentes que seus clientes costumam
                        falar.
                      </small>
                      <div className="wa-pattern-list">
                        {custom.map((item) => (
                          <div
                            className={!item.enabled ? "is-disabled" : ""}
                            key={item.publicId}
                          >
                            {editing === item.publicId ? (
                              <input
                                className="wa-inline-input"
                                autoFocus
                                defaultValue={item.pattern}
                                onBlur={(event) =>
                                  updatePattern.mutate({
                                    publicId: item.publicId,
                                    body: { pattern: event.target.value },
                                  })
                                }
                              />
                            ) : (
                              <span>{friendlyPattern(item.pattern)}</span>
                            )}
                            <div className="wa-row-actions">
                              <button
                                type="button"
                                disabled={!canManage}
                                onClick={() =>
                                  updatePattern.mutate({
                                    publicId: item.publicId,
                                    body: { enabled: !item.enabled },
                                  })
                                }
                              >
                                {item.enabled ? "Desativar" : "Ativar"}
                              </button>
                              <button
                                type="button"
                                disabled={!canManage}
                                onClick={() => setEditing(item.publicId)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="is-danger"
                                disabled={!canManage}
                                onClick={() =>
                                  removePattern.mutate(item.publicId)
                                }
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {canManage && (
                        <div className="wa-add-pattern">
                          <input
                            value={intent === key ? pattern : ""}
                            placeholder="Ex.: queria marcar um horário amanhã"
                            onChange={(event) => {
                              setIntent(key);
                              setPattern(event.target.value);
                            }}
                          />
                          <button
                            type="button"
                            disabled={intent !== key || !pattern.trim()}
                            onClick={() => addPattern.mutate()}
                          >
                            Ensinar frase
                          </button>
                        </div>
                      )}
                      <div className="wa-variable-chips">
                        <span>Partes que podem mudar:</span>
                        {tags.map((tag) => (
                          <button
                            type="button"
                            key={tag}
                            onClick={() =>
                              setPattern(
                                (value) => `${value}${value ? " " : ""}${tag}`,
                              )
                            }
                          >
                            {tagLabels[tag.slice(1, -1)]}
                          </button>
                        ))}
                      </div>
                      <small className="wa-muted">
                        Use esses botões para indicar as partes da frase que
                        podem mudar.
                      </small>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}
      {section === "test" && (
        <div className="wa-intelligence-content">
          <div className="wa-section-heading">
            <div>
              <span className="wa-kicker">TESTE RÁPIDO</span>
              <h2>Testar uma mensagem</h2>
              <p>
                Digite uma frase como se fosse um cliente. O Agendei mostra o
                que entendeu.
              </p>
            </div>
          </div>
          <div className="wa-card wa-simulator-input">
            <label>
              O que o cliente diria?
              <textarea
                value={text}
                disabled={!canManage}
                placeholder="Ex.: Quero marcar corte e barba amanhã às 14h"
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            <div className="wa-simulator-footer">
              <small>
                Escreva do jeito que seus clientes normalmente falam.
              </small>
              <button
                className="wa-primary-action"
                type="button"
                disabled={!text.trim() || simulation.isPending}
                onClick={() => simulation.mutate()}
              >
                {simulation.isPending ? "Entendendo…" : "Entender mensagem"}
              </button>
            </div>
          </div>
          {simulation.data && (
            <div className="wa-test-result">
              <div className="wa-result-header">
                <div>
                  <span className="wa-kicker">O QUE O AGENTE ENTENDEU</span>
                  <h2>
                    {simulation.data.missingFields.length
                      ? "Falta uma informação"
                      : simulation.data.intent === "UNKNOWN"
                        ? "Não consegui entender"
                        : "Entendeu tudo"}
                  </h2>
                </div>
                <span className="wa-result-status">
                  {simulation.data.missingFields.length
                    ? "Atenção necessária"
                    : simulation.data.intent === "UNKNOWN"
                      ? "Tente outra frase"
                      : "Tudo certo"}
                </span>
              </div>
              <div className="wa-result-badges">
                <span>
                  <small>Ação</small>
                  <strong>
                    {intents.find(
                      ([key]) => key === simulation.data?.intent,
                    )?.[1] ?? "Não identificada"}
                  </strong>
                </span>
                <span>
                  <small>Certeza</small>
                  <strong>
                    {simulation.data.confidence >= 0.8
                      ? "Alta"
                      : simulation.data.confidence >= 0.5
                        ? "Média"
                        : "Baixa"}
                  </strong>
                </span>
                <span>
                  <small>Como foi ensinado</small>
                  <strong>
                    {simulation.data.source === "PLATFORM" ? "Agendei" : "Você"}
                  </strong>
                </span>
              </div>
              <div className="wa-entities">
                <h3>Informações encontradas</h3>
                <div className="wa-entity-grid">
                  {simulation.data.entities
                    .filter((entity) => entity.entity || entity.value)
                    .map((entity) => (
                      <div key={`${entity.tag}:${entity.value}`}>
                        <small>{fieldLabel[entity.tag] ?? entity.tag}</small>
                        <strong>
                          {entity.entity &&
                          typeof entity.entity === "object" &&
                          "name" in entity.entity
                            ? String(entity.entity.name)
                            : entity.value || "Não identificado"}
                        </strong>
                      </div>
                    ))}
                </div>
              </div>
              {simulation.data.missingFields.length > 0 && (
                <div className="wa-result-alert">
                  <strong>Falta saber:</strong>
                  <span>{simulation.data.missingFields.join(", ")}</span>
                </div>
              )}
              {simulation.data.ambiguousEntities.length > 0 &&
                simulation.data.missingFields.length > 0 && (
                  <div className="wa-result-alert">
                    <strong>Precisamos confirmar:</strong>
                    <span>{simulation.data.ambiguousEntities.join(", ")}</span>
                  </div>
                )}
              <details className="wa-technical-result">
                <summary>
                  Ver detalhes técnicos <span>⌄</span>
                </summary>
                <div>
                  <span>
                    <strong>Intent</strong>
                    {simulation.data.intent}
                  </span>
                  <span>
                    <strong>Pattern</strong>
                    {simulation.data.pattern ?? "Nenhum"}
                  </span>
                  <span>
                    <strong>Confidence</strong>
                    {Math.round(simulation.data.confidence * 100)}%
                  </span>
                  <span>
                    <strong>Origem</strong>
                    {simulation.data.source}
                  </span>
                </div>
              </details>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
