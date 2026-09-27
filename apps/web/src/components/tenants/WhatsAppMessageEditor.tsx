import { useEffect, useState } from 'react';

interface WhatsAppButton {
  actionKey: string;
  label: string;
  enabled: boolean;
  order: number;
}

interface WhatsAppMessageConfig {
  kind: string;
  title: string;
  description: string;
  enabled: boolean;
  body: string;
  buttons: WhatsAppButton[];
  allowedActions: string[];
  isCustomized: boolean;
  placeholders: string[];
}

interface WhatsAppReminderConfig {
  dayBeforeEnabled: boolean;
  dayBeforeDaysBefore: number;
  dayBeforeHour: number;
  dayBeforeMinute: number;
  upcomingEnabled: boolean;
  upcomingMinutesBefore: number;
}

interface WhatsAppMessageEditorProps {
  message: WhatsAppMessageConfig;
  isExpanded: boolean;
  onToggleExpand: (kind: string) => void;
  canManage: boolean;
  friendlyTitle: string;
  friendlyDescription: string;
  isDayBefore: boolean;
  isUpcoming: boolean;
  reminderConfig: WhatsAppReminderConfig | undefined;
  onSaveMessage: (payload: Record<string, unknown>) => void;
  onRestoreMessage: () => void;
  onSaveReminderConfig: (payload: Record<string, unknown>) => void;
  isSaving: boolean;
  error: Error | null;
}

export function WhatsAppMessageEditor({
  message,
  isExpanded,
  onToggleExpand,
  canManage,
  friendlyTitle,
  friendlyDescription,
  isDayBefore,
  isUpcoming,
  reminderConfig,
  onSaveMessage,
  onRestoreMessage,
  onSaveReminderConfig,
  isSaving,
  error,
}: WhatsAppMessageEditorProps) {
  const [body, setBody] = useState(message.body ?? '');
  const [enabled, setEnabled] = useState(message.enabled);
  const [buttons, setButtons] = useState<WhatsAppButton[]>(message.buttons);
  const [dayBeforeEnabled, setDayBeforeEnabled] = useState(
    reminderConfig?.dayBeforeEnabled ?? true,
  );
  const [dayBeforeDaysBefore, setDayBeforeDaysBefore] = useState(
    reminderConfig?.dayBeforeDaysBefore ?? 1,
  );
  const [dayBeforeHour, setDayBeforeHour] = useState(reminderConfig?.dayBeforeHour ?? 9);
  const [dayBeforeMinute, setDayBeforeMinute] = useState(reminderConfig?.dayBeforeMinute ?? 0);
  const [upcomingEnabled, setUpcomingEnabled] = useState(
    reminderConfig?.upcomingEnabled ?? true,
  );
  const [upcomingMinutesBefore, setUpcomingMinutesBefore] = useState(
    reminderConfig?.upcomingMinutesBefore ?? 15,
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [hasReminderChanges, setHasReminderChanges] = useState(false);

  useEffect(() => {
    setBody(message.body ?? '');
    setEnabled(message.enabled);
    setButtons(message.buttons);
    setHasChanges(false);
  }, [message.kind, message.isCustomized]);

  useEffect(() => {
    setDayBeforeEnabled(reminderConfig?.dayBeforeEnabled ?? true);
    setDayBeforeDaysBefore(reminderConfig?.dayBeforeDaysBefore ?? 1);
    setDayBeforeHour(reminderConfig?.dayBeforeHour ?? 9);
    setDayBeforeMinute(reminderConfig?.dayBeforeMinute ?? 0);
    setUpcomingEnabled(reminderConfig?.upcomingEnabled ?? true);
    setUpcomingMinutesBefore(reminderConfig?.upcomingMinutesBefore ?? 15);
    setHasReminderChanges(false);
  }, [reminderConfig?.dayBeforeEnabled, reminderConfig?.dayBeforeDaysBefore, reminderConfig?.dayBeforeHour, reminderConfig?.dayBeforeMinute, reminderConfig?.upcomingEnabled, reminderConfig?.upcomingMinutesBefore]);

  const handleBodyChange = (newBody: string) => {
    setBody(newBody);
    setHasChanges(true);
  };

  const handleEnabledChange = (newEnabled: boolean) => {
    setEnabled(newEnabled);
    setHasChanges(true);
  };

  const handleButtonLabelChange = (index: number, newLabel: string) => {
    const newButtons = [...buttons];
    if (newButtons[index]) {
      newButtons[index].label = newLabel;
      setButtons(newButtons);
      setHasChanges(true);
    }
  };

  const handleButtonEnabledChange = (index: number, newEnabled: boolean) => {
    const newButtons = [...buttons];
    if (newButtons[index]) {
      newButtons[index].enabled = newEnabled;
      setButtons(newButtons);
      setHasChanges(true);
    }
  };

  const handleMoveButton = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex >= 0 && newIndex < buttons.length) {
      const newButtons = [...buttons];
      [newButtons[index], newButtons[newIndex]] = [newButtons[newIndex]!, newButtons[index]!];
      newButtons.forEach((btn, i) => {
        btn.order = i + 1;
      });
      setButtons(newButtons);
      setHasChanges(true);
    }
  };

  const handleInsertPlaceholder = (placeholder: string) => {
    const textarea = document.getElementById(`message-body-${message.kind}`) as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newBody = body.substring(0, start) + placeholder + body.substring(end);
      setBody(newBody);
      setHasChanges(true);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + placeholder.length;
        textarea.focus();
      }, 0);
    }
  };

  const handleSave = () => {
    const payload: UpdateWhatsAppMessage = {};
    if (body !== message.body) payload.body = body;
    if (enabled !== message.enabled) payload.enabled = enabled;
    if (JSON.stringify(buttons) !== JSON.stringify(message.buttons)) payload.buttons = buttons;
    onSaveMessage(payload);
    setHasChanges(false);
  };

  const handleRestoreDefault = () => {
    if (confirm('Restaurar o padrão desta mensagem?')) {
      onRestoreMessage();
      setBody(message.body);
      setEnabled(message.enabled);
      setButtons(message.buttons);
      setHasChanges(false);
    }
  };

  const handleSaveReminder = () => {
    const payload: UpdateWhatsAppReminderConfig = {};
    if (isDayBefore) {
      if (dayBeforeEnabled !== reminderConfig?.dayBeforeEnabled) payload.dayBeforeEnabled = dayBeforeEnabled;
      if (dayBeforeDaysBefore !== reminderConfig?.dayBeforeDaysBefore) payload.dayBeforeDaysBefore = dayBeforeDaysBefore;
      if (dayBeforeHour !== reminderConfig?.dayBeforeHour) payload.dayBeforeHour = dayBeforeHour;
      if (dayBeforeMinute !== reminderConfig?.dayBeforeMinute) payload.dayBeforeMinute = dayBeforeMinute;
    }
    if (isUpcoming) {
      if (upcomingEnabled !== reminderConfig?.upcomingEnabled) payload.upcomingEnabled = upcomingEnabled;
      if (upcomingMinutesBefore !== reminderConfig?.upcomingMinutesBefore) payload.upcomingMinutesBefore = upcomingMinutesBefore;
    }
    if (Object.keys(payload).length > 0) {
      onSaveReminderConfig(payload);
      setHasReminderChanges(false);
    }
  };

  return (
    <div className="whatsapp-message-card">
      <button
        className="whatsapp-message-header"
        type="button"
        onClick={() => onToggleExpand(message.kind)}
      >
        <div className="whatsapp-message-header-content">
          <h4>{friendlyTitle}</h4>
          <p className="ds-form-hint">{friendlyDescription}</p>
        </div>
        <span className="whatsapp-message-toggle">
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>

      {isExpanded && (
        <div className="whatsapp-message-content">
          {error && <p className="form-error">{error.message}</p>}

          {canManage && (
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => handleEnabledChange(e.target.checked)}
                  disabled={isSaving}
                />
                <span>Ativar envio por WhatsApp</span>
              </label>
              <small className="ds-form-hint">
                Desativa apenas o envio pelo WhatsApp. E-mail e push continuam ativos, quando
                configurados.
              </small>
            </div>
          )}

          {/* Day Before Reminder Config */}
          {isDayBefore && reminderConfig && (
            <div className="form-group whatsapp-reminder-config">
              <h5>Quando enviar</h5>
              <label>
                <input
                  type="checkbox"
                  checked={dayBeforeEnabled}
                  onChange={(e) => {
                    setDayBeforeEnabled(e.target.checked);
                    setHasReminderChanges(true);
                  }}
                  disabled={isSaving}
                />
                <span>Ativar lembrete</span>
              </label>
              {dayBeforeEnabled && (
                <div className="form-row">
                  <div>
                    <label htmlFor={`days-before-${message.kind}`}>Dias antes:</label>
                    <input
                      id={`days-before-${message.kind}`}
                      type="number"
                      min="1"
                      max="30"
                      value={dayBeforeDaysBefore}
                      onChange={(e) => {
                        setDayBeforeDaysBefore(parseInt(e.target.value, 10));
                        setHasReminderChanges(true);
                      }}
                      disabled={isSaving}
                    />
                  </div>
                  <div>
                    <label htmlFor={`hour-${message.kind}`}>Hora:</label>
                    <input
                      id={`hour-${message.kind}`}
                      type="number"
                      min="0"
                      max="23"
                      value={String(dayBeforeHour).padStart(2, '0')}
                      onChange={(e) => {
                        setDayBeforeHour(parseInt(e.target.value, 10));
                        setHasReminderChanges(true);
                      }}
                      disabled={isSaving}
                    />
                  </div>
                  <div>
                    <label htmlFor={`minute-${message.kind}`}>Minuto:</label>
                    <input
                      id={`minute-${message.kind}`}
                      type="number"
                      min="0"
                      max="59"
                      value={String(dayBeforeMinute).padStart(2, '0')}
                      onChange={(e) => {
                        setDayBeforeMinute(parseInt(e.target.value, 10));
                        setHasReminderChanges(true);
                      }}
                      disabled={isSaving}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Upcoming Reminder Config */}
          {isUpcoming && reminderConfig && (
            <div className="form-group whatsapp-reminder-config">
              <h5>Quando enviar</h5>
              <label>
                <input
                  type="checkbox"
                  checked={upcomingEnabled}
                  onChange={(e) => {
                    setUpcomingEnabled(e.target.checked);
                    setHasReminderChanges(true);
                  }}
                  disabled={isSaving}
                />
                <span>Ativar lembrete</span>
              </label>
              {upcomingEnabled && (
                <div className="form-row">
                  <div>
                    <label htmlFor={`minutes-before-${message.kind}`}>Minutos antes:</label>
                    <input
                      id={`minutes-before-${message.kind}`}
                      type="number"
                      min="1"
                      max="1440"
                      value={upcomingMinutesBefore}
                      onChange={(e) => {
                        setUpcomingMinutesBefore(parseInt(e.target.value, 10));
                        setHasReminderChanges(true);
                      }}
                      disabled={isSaving}
                    />
                  </div>
                </div>
              )}
              <div className="quick-chips">
                {[15, 30, 60, 90, 120].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className={`chip ${upcomingMinutesBefore === minutes ? 'active' : ''}`}
                    onClick={() => {
                      setUpcomingMinutesBefore(minutes);
                      setHasReminderChanges(true);
                    }}
                    disabled={isSaving}
                  >
                    {minutes} min
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message Body */}
          {canManage && (
            <div className="form-group">
              <label htmlFor={`message-body-${message.kind}`}>Mensagem</label>
              <textarea
                id={`message-body-${message.kind}`}
                value={body}
                onChange={(e) => handleBodyChange(e.target.value)}
                disabled={isSaving}
                maxLength={4000}
              />
              <small className="ds-form-hint">
                {body.length}/4000 caracteres
              </small>
            </div>
          )}

          {/* Placeholders */}
          {canManage && message.placeholders.length > 0 && (
            <div className="form-group">
              <label>Placeholders disponíveis</label>
              <div className="placeholders-chips">
                {message.placeholders.map((placeholder) => (
                  <button
                    key={placeholder}
                    type="button"
                    className="chip"
                    onClick={() => handleInsertPlaceholder(`{{${placeholder}}}`)}
                    disabled={isSaving}
                  >
                    {placeholder}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Buttons */}
          {canManage && buttons.length > 0 && (
            <div className="form-group">
              <label>Botões do WhatsApp</label>
              {buttons.map((button, index) => (
                <div key={index} className="whatsapp-button-editor">
                  <label>
                    <input
                      type="checkbox"
                      checked={button.enabled}
                      onChange={(e) => handleButtonEnabledChange(index, e.target.checked)}
                      disabled={isSaving}
                    />
                    <span>Ativo</span>
                  </label>
                  <div className="button-content">
                    <div>
                      <label htmlFor={`button-label-${index}`}>Texto do botão:</label>
                      <input
                        id={`button-label-${index}`}
                        type="text"
                        value={button.label}
                        onChange={(e) => handleButtonLabelChange(index, e.target.value)}
                        disabled={isSaving}
                        maxLength={100}
                      />
                    </div>
                    <div>
                      <label>Ação:</label>
                      <span className="action-key">{button.actionKey}</span>
                    </div>
                  </div>
                  {buttons.length > 1 && (
                    <div className="button-controls">
                      <button
                        type="button"
                        onClick={() => handleMoveButton(index, 'up')}
                        disabled={isSaving || index === 0}
                        title="Mover para cima"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveButton(index, 'down')}
                        disabled={isSaving || index === buttons.length - 1}
                        title="Mover para baixo"
                      >
                        ↓
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Preview */}
          {(isDayBefore || isUpcoming) && (
            <div className="form-group whatsapp-preview">
              <label>Preview</label>
              <div className="whatsapp-message-preview">
                <p>{body}</p>
                {buttons.filter((b) => b.enabled).length > 0 && (
                  <div className="preview-buttons">
                    {buttons
                      .filter((b) => b.enabled)
                      .sort((a, b) => a.order - b.order)
                      .map((button) => (
                        <div key={button.actionKey} className="preview-button">
                          {button.label}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          {canManage && (
            <div className="form-row whatsapp-message-actions">
              {hasChanges && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'Salvando…' : 'Salvar alterações'}
                </button>
              )}
              {hasReminderChanges && (isDayBefore || isUpcoming) && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleSaveReminder}
                  disabled={isSaving}
                >
                  {isSaving ? 'Salvando…' : 'Salvar configuração'}
                </button>
              )}
              {message.isCustomized && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleRestoreDefault}
                  disabled={isSaving}
                >
                  Restaurar padrão
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
