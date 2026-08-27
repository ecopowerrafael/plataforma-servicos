import { type PrismaClient } from '../../database-client/client.js';

interface ProcessStepResponseInput {
  execution: any;
  step: any;
  inboundMessage: any;
  tx?: PrismaClient;
}

interface MatchedOption {
  option: any;
  pattern: any;
  matchedVia: 'EXACT' | 'STARTS_WITH' | 'ENDS_WITH' | 'CONTAINS';
}

/**
 * Engine para processar respostas inbound dentro de FlowExecution.
 * Reutiliza padrões de normalização sem acoplar ao ObjectionEngine.
 */
export class ProspectingFlowEngine {
  public constructor(private readonly client: PrismaClient) {}

  /**
   * Processa inbound recebido durante WAITING de FlowExecution.
   */
  public async processStepResponse(input: ProcessStepResponseInput): Promise<{
    executionAdvanced: boolean;
    newStepId?: bigint;
    reason?: string;
  }> {
    const { execution, step, inboundMessage } = input;
    const tx = input.tx || this.client;

    if (execution.status !== 'WAITING') {
      return { executionAdvanced: false, reason: 'EXECUTION_NOT_WAITING' };
    }

    const normalizedText = this.normalizeText(inboundMessage.body);

    // Processar conforme tipo de step
    switch (step.stepType) {
      case 'MESSAGE_OPTIONS':
        return await this.handleMessageOptions(tx, execution, step, normalizedText, inboundMessage);

      case 'WAIT_TEXT':
        return await this.handleWaitText(tx, execution, step, inboundMessage);

      case 'WAIT_LINK':
        return await this.handleWaitLink(tx, execution, step, normalizedText, inboundMessage);

      default:
        return { executionAdvanced: false, reason: 'UNSUPPORTED_STEP_TYPE' };
    }
  }

  private async handleMessageOptions(
    tx: any,
    execution: any,
    step: any,
    normalizedText: string,
    inboundMessage: any,
  ): Promise<any> {
    const matchedOption = this.findMatchingOption(normalizedText, step);

    // Persistir response sempre (sem publicId)
    await tx.prospectingFlowResponse.create({
      data: {
        executionId: execution.id,
        stepId: step.id,
        inboundMessageId: inboundMessage.id,
        responseText: inboundMessage.body,
        matchedOptionId: matchedOption?.option.id || null,
        createdAt: new Date(),
      },
    });

    if (!matchedOption) {
      // Sem match: continuar esperando
      return { executionAdvanced: false, reason: 'NO_OPTION_MATCH' };
    }

    // Aplicar ação da option
    return await this.applyOptionAction(tx, execution, step, matchedOption.option);
  }

  private async handleWaitText(
    tx: any,
    execution: any,
    step: any,
    inboundMessage: any,
  ): Promise<any> {
    // Persistir response (sem publicId)
    await tx.prospectingFlowResponse.create({
      data: {
        executionId: execution.id,
        stepId: step.id,
        inboundMessageId: inboundMessage.id,
        responseText: inboundMessage.body,
        matchedOptionId: null,
        createdAt: new Date(),
      },
    });

    // Avançar para próximo step
    if (step.nextStepId) {
      await tx.prospectingFlowExecution.update({
        where: { id: execution.id },
        data: { currentStepId: step.nextStepId, status: 'ACTIVE' },
      });

      await tx.prospectingLead.update({
        where: { id: execution.leadId },
        data: {
          status: 'SCHEDULED',
          nextActionAt: new Date(),
        },
      });

      return { executionAdvanced: true, newStepId: step.nextStepId };
    } else {
      // Sem próximo: completar
      await tx.prospectingFlowExecution.update({
        where: { id: execution.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      return { executionAdvanced: true, reason: 'FLOW_COMPLETED' };
    }
  }

  private async handleWaitLink(
    tx: any,
    execution: any,
    step: any,
    _normalizedText: string,
    inboundMessage: any,
  ): Promise<any> {
    const url = this.extractUrlFromText(inboundMessage.body);

    // Persistir response (sem publicId)
    await tx.prospectingFlowResponse.create({
      data: {
        executionId: execution.id,
        stepId: step.id,
        inboundMessageId: inboundMessage.id,
        responseText: inboundMessage.body,
        matchedOptionId: null,
        createdAt: new Date(),
      },
    });

    if (!url || !this.isValidUrl(url)) {
      // URL inválida: continuar esperando
      return { executionAdvanced: false, reason: 'INVALID_OR_NO_URL' };
    }

    // URL válida: avançar
    if (step.nextStepId) {
      await tx.prospectingFlowExecution.update({
        where: { id: execution.id },
        data: { currentStepId: step.nextStepId, status: 'ACTIVE' },
      });

      await tx.prospectingLead.update({
        where: { id: execution.leadId },
        data: {
          status: 'SCHEDULED',
          nextActionAt: new Date(),
        },
      });

      return { executionAdvanced: true, newStepId: step.nextStepId };
    } else {
      await tx.prospectingFlowExecution.update({
        where: { id: execution.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      return { executionAdvanced: true, reason: 'FLOW_COMPLETED' };
    }
  }

  private async applyOptionAction(tx: any, execution: any, _step: any, option: any): Promise<any> {
    switch (option.actionType) {
      case 'NEXT_STEP':
        if (!option.nextStepId) {
          return { executionAdvanced: false, reason: 'NEXT_STEP_MISSING_DESTINATION' };
        }

        // Validar que nextStep pertence ao mesmo flow
        const nextStep = await tx.prospectingFlowStep.findUnique({
          where: { id: option.nextStepId },
        });

        if (!nextStep || nextStep.flowId !== execution.flowId) {
          return { executionAdvanced: false, reason: 'NEXT_STEP_NOT_FOUND' };
        }

        await tx.prospectingFlowExecution.update({
          where: { id: execution.id },
          data: { currentStepId: nextStep.id, status: 'ACTIVE' },
        });

        await tx.prospectingLead.update({
          where: { id: execution.leadId },
          data: {
            status: 'SCHEDULED',
            nextActionAt: new Date(),
          },
        });

        return { executionAdvanced: true, newStepId: nextStep.id };

      case 'END':
        await tx.prospectingFlowExecution.update({
          where: { id: execution.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });

        await tx.prospectingLead.update({
          where: { id: execution.leadId },
          data: { nextActionAt: null },
        });

        return { executionAdvanced: true, reason: 'FLOW_ENDED' };

      case 'MANUAL':
        await tx.prospectingFlowExecution.update({
          where: { id: execution.id },
          data: { status: 'MANUAL' },
        });

        await tx.prospectingLead.update({
          where: { id: execution.leadId },
          data: {
            humanLockUntil: new Date(Date.now() + 30 * 24 * 3600_000),
            humanLockType: 'FLOW_MANUAL',
            humanLockReason: 'Manual intervention required by flow',
            nextActionAt: null,
          },
        });

        return { executionAdvanced: true, reason: 'FLOW_MANUAL_REQUIRED' };

      default:
        return { executionAdvanced: false, reason: 'UNKNOWN_ACTION_TYPE' };
    }
  }

  private findMatchingOption(normalizedText: string, step: any): MatchedOption | null {
    // Coletar todos os patterns
    const allPatterns = step.options
      .flatMap((opt: any) => opt.patterns.map((p: any) => ({ ...p, option: opt })))
      .sort((a: any, b: any) => {
        // 1. Priority DESC
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }

        // 2. Specificity DESC
        const specMap = { EXACT: 4, STARTS_WITH: 3, ENDS_WITH: 3, CONTAINS: 2 };
        const specA = specMap[a.patternType as keyof typeof specMap] ?? 0;
        const specB = specMap[b.patternType as keyof typeof specMap] ?? 0;
        if (specA !== specB) {
          return specB - specA;
        }

        // 3. Option position ASC
        if (a.option.position !== b.option.position) {
          return a.option.position - b.option.position;
        }

        // 4. Pattern ID ASC (BigInt safe)
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return 0;
      });

    const seenOptions = new Set<bigint>();

    // Test cada padrão
    for (const p of allPatterns) {
      if (seenOptions.has(p.option.id)) {
        continue;
      }

      const normalized = this.normalizeText(p.pattern);
      let matched = false;

      if (p.patternType === 'EXACT' && normalizedText === normalized) {
        matched = true;
      } else if (p.patternType === 'STARTS_WITH' && normalizedText.startsWith(normalized)) {
        matched = true;
      } else if (p.patternType === 'ENDS_WITH' && normalizedText.endsWith(normalized)) {
        matched = true;
      } else if (p.patternType === 'CONTAINS' && normalizedText.includes(normalized)) {
        matched = true;
      }

      if (matched) {
        seenOptions.add(p.option.id);
        return {
          option: p.option,
          pattern: p,
          matchedVia: p.patternType,
        };
      }
    }

    return null;
  }

  private extractUrlFromText(text: string): string | null {
    const urlRegex = /https?:\/\/[^\s]+/i;
    const match = text.match(urlRegex);
    return match?.[0] ?? null;
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private normalizeText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/[àáâãäå]/g, 'a')
      .replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u')
      .replace(/[ç]/g, 'c')
      .replace(/\s+/g, ' ');
  }
}
