export function ProductPreview() {
  return (
    <div
      className="product-preview"
      aria-label="Visão da plataforma com agenda e agendamento online"
    >
      <div className="product-preview-desktop">
        <div className="product-preview-bar">
          <span className="preview-logo">P</span>
          <div>
            <strong>Agenda</strong>
            <small>Visão semanal</small>
          </div>
          <span className="preview-status">Operação organizada</span>
        </div>
        <div className="product-preview-body">
          <aside aria-hidden="true">
            <span className="preview-nav-active">Agenda</span>
            <span>Clientes</span>
            <span>Equipe</span>
            <span>Financeiro</span>
            <span>Estoque</span>
          </aside>
          <div className="preview-calendar">
            <div className="preview-calendar-head">
              <div>
                <small>Agenda da equipe</small>
                <strong>Atendimentos da semana</strong>
              </div>
              <button type="button" tabIndex={-1}>
                Novo atendimento
              </button>
            </div>
            <div className="preview-days" aria-hidden="true">
              <span>Hoje</span>
              <span>Amanhã</span>
              <span>Próximos dias</span>
            </div>
            <div className="preview-schedule" aria-hidden="true">
              <div className="preview-time-column">
                <span>Manhã</span>
                <span>Tarde</span>
                <span>Noite</span>
              </div>
              <div className="preview-appointments">
                <article className="preview-appointment preview-appointment--green">
                  <strong>Atendimento confirmado</strong>
                  <span>Serviço e profissional vinculados</span>
                </article>
                <article className="preview-appointment preview-appointment--cream">
                  <strong>Horário disponível</strong>
                  <span>Pronto para agendamento online</span>
                </article>
                <article className="preview-appointment preview-appointment--coral">
                  <strong>Próximo atendimento</strong>
                  <span>Cliente e equipe informados</span>
                </article>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="product-preview-mobile">
        <div className="preview-mobile-top">
          <span className="preview-logo">P</span>
          <span>Agendamento online</span>
        </div>
        <div className="preview-mobile-content">
          <p className="marketing-eyebrow">Seu próximo horário</p>
          <h3>Escolha como quer ser atendido</h3>
          <div className="preview-mobile-option">
            <i aria-hidden="true">1</i>
            <span>
              <strong>Serviço</strong>
              <small>Escolha o atendimento</small>
            </span>
          </div>
          <div className="preview-mobile-option">
            <i aria-hidden="true">2</i>
            <span>
              <strong>Profissional</strong>
              <small>Quando aplicável</small>
            </span>
          </div>
          <div className="preview-mobile-option">
            <i aria-hidden="true">3</i>
            <span>
              <strong>Horário</strong>
              <small>Disponibilidade em tempo real</small>
            </span>
          </div>
          <span className="preview-mobile-button">Continuar</span>
        </div>
      </div>
    </div>
  );
}
