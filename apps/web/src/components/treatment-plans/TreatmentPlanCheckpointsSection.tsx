import { type TreatmentPlanPublic } from '@plataforma/shared';
import { useState } from 'react';
import { formatShortDate } from '../customers/customer-crm.js';
import { formatMoneyCents } from '../customers/customer-crm.js';

export function TreatmentPlanCheckpointsSection({ plan }: { plan: TreatmentPlanPublic }) {
  const [showAllSessions, setShowAllSessions] = useState(false);

  interface Checkpoint {
    id: string;
    label: string;
    date?: string;
    status: 'completed' | 'pending' | 'future';
    icon: string;
    details?: string;
  }

  const checkpoints: Checkpoint[] = [];

  // Orçamento criado
  checkpoints.push({
    id: 'created',
    label: 'Orçamento criado',
    date: plan.createdAt,
    status: 'completed',
    icon: '✓',
  });

  // Aprovado
  if (plan.status !== 'PENDING') {
    checkpoints.push({
      id: 'approved',
      label: 'Orçamento aprovado',
      date: plan.createdAt, // Usar createdAt como proxy se não houver approvedAt
      status: 'completed',
      icon: '✓',
    });
  }

  // Sessões
  const sessionsByNumber = plan.sessions.reduce(
    (acc, session) => {
      const num = session.sessionNumber;
      if (!acc[num]) acc[num] = [];
      acc[num].push(session);
      return acc;
    },
    {} as Record<number, typeof plan.sessions>,
  );

  const maxSessionNumber = plan.sessionsPlanned || plan.sessions.length;
  const sessionsToDisplay = showAllSessions ? maxSessionNumber : Math.min(3, maxSessionNumber);

  for (let i = 1; i <= sessionsToDisplay; i++) {
    const sessionList = sessionsByNumber[i];
    const session = sessionList?.[0];

    if (session) {
      checkpoints.push({
        id: `session-${i}-scheduled`,
        label: `Sessão ${i} agendada`,
        date: session.startsAt,
        status: session.status === 'CANCELED' ? 'future' : 'completed',
        icon: '📅',
        details: `${formatShortDate(new Date(session.startsAt))} - ${formatMoneyCents(session.priceCents)}`,
      });

      if (session.status === 'COMPLETED') {
        checkpoints.push({
          id: `session-${i}-completed`,
          label: `Sessão ${i} realizada`,
          date: session.startsAt,
          status: 'completed',
          icon: '✓',
        });
      }
    } else if (i <= plan.sessionsCompleted) {
      // Sessão realizada mas sem detalhes
      checkpoints.push({
        id: `session-${i}-completed`,
        label: `Sessão ${i} realizada`,
        status: 'completed',
        icon: '✓',
      });
    }
  }

  // Próxima sessão recomendada
  if (plan.recommendedNextDate && plan.status !== 'COMPLETED' && plan.status !== 'CANCELED') {
    checkpoints.push({
      id: 'next-recommended',
      label: 'Próxima sessão recomendada',
      date: plan.recommendedNextDate,
      status: new Date(plan.recommendedNextDate) > new Date() ? 'future' : 'pending',
      icon: '📍',
      details: formatShortDate(new Date(plan.recommendedNextDate)),
    });
  }

  // Concluído
  if (plan.status === 'COMPLETED') {
    checkpoints.push({
      id: 'completed',
      label: 'Plano concluído',
      status: 'completed',
      icon: '🏁',
    });
  }

  // Cancelado
  if (plan.status === 'CANCELED') {
    checkpoints.push({
      id: 'canceled',
      label: 'Plano cancelado',
      status: 'completed',
      icon: '✕',
    });
  }

  const hasMoreSessions = maxSessionNumber > sessionsToDisplay;

  return (
    <div className="treatment-plan-checkpoints">
      <h3>Progresso do plano</h3>

      <div className="checkpoints-timeline">
        {checkpoints.map((checkpoint, index) => (
          <div key={checkpoint.id} className="checkpoint-item">
            <div className={`checkpoint-marker status-${checkpoint.status}`}>{checkpoint.icon}</div>
            <div className="checkpoint-content">
              <p className="checkpoint-label">{checkpoint.label}</p>
              {checkpoint.date && <p className="checkpoint-date">{formatShortDate(new Date(checkpoint.date))}</p>}
              {checkpoint.details && <p className="checkpoint-details">{checkpoint.details}</p>}
            </div>
            {index < checkpoints.length - 1 && <div className="checkpoint-line" />}
          </div>
        ))}
      </div>

      {hasMoreSessions && (
        <button
          type="button"
          className="checkpoints-toggle"
          onClick={() => setShowAllSessions(!showAllSessions)}
        >
          {showAllSessions ? '▼ Ocultar todas as sessões' : '▶ Ver todas as sessões'}
          ({plan.sessions.length} total)
        </button>
      )}
    </div>
  );
}
