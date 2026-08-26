import { type PrismaClient } from '../../database-client/client.js';
import { ProspectingAutoReplyScheduler } from './prospecting-auto-reply-scheduler.js';

interface ClassificationInput {
  campaignId: bigint;
  leadId: bigint;
  messageId: bigint;
  inboundMessageId?: bigint;
  text: string;
}

interface ClassificationResult {
  matched: boolean;
  objectionPublicId?: string;
  objectionCode?: string | undefined;
  objectionId?: bigint;
  confidence: 'EXACT' | 'RULE';
  suggestedResponse?: string | undefined;
}

interface PatternMatch {
  objectionId: bigint;
  objectionPublicId: string;
  objectionCode: string | null;
  suggestedResponse: string | null;
  priority: number;
  patternType: string;
  confidence: 'EXACT' | 'RULE';
}

/**
 * Deterministic classification engine para Prospecting inbound.
 * Sem IA, baseado em patterns textuais.
 */
export class ProspectingObjectionEngine {
  private readonly statusMap: Record<string, string> = {
    INTERESSADO: 'INTERESTED',
    QUER_SABER_MAIS: 'QUALIFYING',
    PRECO: 'QUALIFYING',
    JA_USA_SISTEMA: 'QUALIFYING',
    FALAR_DEPOIS: 'FOLLOW_UP',
    SEM_TEMPO: 'FOLLOW_UP',
    SEM_INTERESSE: 'LOST',
    CONTATO_ERRADO: 'LOST',
    NAO_ENTENDEU: 'QUALIFYING',
  };

  private readonly noOverrideStatuses = ['WON', 'LOST', 'SUPPRESSED', 'NEEDS_REVIEW'];

  public constructor(
    private readonly client?: PrismaClient | null,
  ) {}

  /**
   * Classifica uma mensagem inbound sem IA.
   */
  public async classify(input: ClassificationInput): Promise<ClassificationResult> {
    if (!this.client) {
      return { matched: false, confidence: 'RULE' };
    }

    // Verificar se já foi classificada
    const existing = await this.client.prospectingMessage.findUnique({
      where: { id: input.messageId },
      select: { classifiedAt: true },
    });

    if (existing?.classifiedAt) {
      return { matched: false, confidence: 'RULE' };
    }

    // Normalizar texto
    const normalized = this.normalizeText(input.text);

    // Buscar patterns ativos ordenados por prioridade e especificidade
    const patterns = await this.client.prospectingObjectionPattern.findMany({
      where: {
        objection: {
          isActive: true,
        },
      },
      select: {
        objectionId: true,
        objection: {
          select: {
            publicId: true,
            code: true,
            suggestedResponse: true,
          },
        },
        patternType: true,
        pattern: true,
        priority: true,
      },
      orderBy: [
        { priority: 'desc' },
      ],
    });

    // Fazer matching (ordem: EXACT > STARTS_WITH/ENDS_WITH > CONTAINS)
    const matches = this.findMatches(normalized, patterns);
    if (matches.length === 0) {
      // Unmatched: apenas marcar classifiedAt, manter status RESPONDED
      await this.client.prospectingMessage.update({
        where: { id: input.messageId },
        data: { classifiedAt: new Date() },
      });

      return { matched: false, confidence: 'RULE' };
    }

    const bestMatch = matches[0]!;

    // Persistir classificação
    await this.client.prospectingMessage.update({
      where: { id: input.messageId },
      data: {
        objectionId: bestMatch.objectionId,
        classifiedAt: new Date(),
      },
    });

    // Atualizar status do lead
    const newStatus = this.statusMap[bestMatch.objectionCode || ''] || 'RESPONDED';
    await this.updateLeadStatus(input.leadId, newStatus);

    // Agendar follow-up se necessário
    if (newStatus === 'FOLLOW_UP') {
      await this.scheduleFollowUp(input.leadId);
    }

    // Pausar se campaign.pauseOnInterest e status = INTERESTED
    if (newStatus === 'INTERESTED') {
      const campaign = await this.client.prospectingCampaign.findUnique({
        where: { id: input.campaignId },
        select: { pauseOnInterest: true },
      });

      if (campaign?.pauseOnInterest) {
        await this.client.prospectingLead.update({
          where: { id: input.leadId },
          data: { nextActionAt: null },
        });
      }
    }

    // Tentar agendar auto-reply se resposta sugerida existe
    if (bestMatch.suggestedResponse && input.inboundMessageId) {
      try {
        const scheduler = new ProspectingAutoReplyScheduler(this.client);
        await scheduler.scheduleAutoReply({
          campaignId: input.campaignId,
          leadId: input.leadId,
          inboundMessageId: input.inboundMessageId,
          objectionId: bestMatch.objectionId,
          suggestedResponse: bestMatch.suggestedResponse,
        });
      } catch (error) {
        // Log but don't fail classification
        console.error('[ProspectingObjectionEngine] Auto-reply scheduling error:', error);
      }
    }

    return {
      matched: true,
      objectionPublicId: bestMatch.objectionPublicId,
      objectionCode: bestMatch.objectionCode || undefined,
      objectionId: bestMatch.objectionId,
      confidence: bestMatch.confidence,
      suggestedResponse: bestMatch.suggestedResponse || undefined,
    };
  }

  /**
   * Encontra patterns que combinam com texto normalizado.
   */
  private findMatches(
    normalized: string,
    patterns: Array<{
      objectionId: bigint;
      objection: {
        publicId: string;
        code: string | null;
        suggestedResponse: string | null;
      };
      patternType: string;
      pattern: string;
      priority: number;
    }>,
  ): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const seenObjections = new Set<bigint>();

    // Primeiro: EXACT matches
    for (const p of patterns) {
      if (p.patternType === 'EXACT' && !seenObjections.has(p.objectionId)) {
        const normalizedPattern = this.normalizeText(p.pattern);
        if (normalized === normalizedPattern) {
          matches.push({
            objectionId: p.objectionId,
            objectionPublicId: p.objection.publicId,
            objectionCode: p.objection.code,
            suggestedResponse: p.objection.suggestedResponse,
            priority: p.priority,
            patternType: 'EXACT',
            confidence: 'EXACT',
          });
          seenObjections.add(p.objectionId);
        }
      }
    }

    if (matches.length > 0) {
      return matches.sort((a, b) => b.priority - a.priority).slice(0, 1);
    }

    // Segundo: STARTS_WITH / ENDS_WITH
    for (const p of patterns) {
      if (!seenObjections.has(p.objectionId)) {
        const normalizedPattern = this.normalizeText(p.pattern);
        let matched = false;

        if (p.patternType === 'STARTS_WITH' && normalized.startsWith(normalizedPattern)) {
          matched = true;
        } else if (p.patternType === 'ENDS_WITH' && normalized.endsWith(normalizedPattern)) {
          matched = true;
        }

        if (matched) {
          matches.push({
            objectionId: p.objectionId,
            objectionPublicId: p.objection.publicId,
            objectionCode: p.objection.code,
            suggestedResponse: p.objection.suggestedResponse,
            priority: p.priority,
            patternType: p.patternType,
            confidence: 'RULE',
          });
          seenObjections.add(p.objectionId);
        }
      }
    }

    if (matches.length > 0) {
      return matches.sort((a, b) => b.priority - a.priority).slice(0, 1);
    }

    // Terceiro: CONTAINS
    for (const p of patterns) {
      if (!seenObjections.has(p.objectionId)) {
        const normalizedPattern = this.normalizeText(p.pattern);

        if (p.patternType === 'CONTAINS' && normalized.includes(normalizedPattern)) {
          matches.push({
            objectionId: p.objectionId,
            objectionPublicId: p.objection.publicId,
            objectionCode: p.objection.code,
            suggestedResponse: p.objection.suggestedResponse,
            priority: p.priority,
            patternType: 'CONTAINS',
            confidence: 'RULE',
          });
          seenObjections.add(p.objectionId);
        }
      }
    }

    return matches.sort((a, b) => b.priority - a.priority).slice(0, 1);
  }

  /**
   * Atualizar status do lead, respeitando finais.
   */
  private async updateLeadStatus(leadId: bigint, newStatus: string): Promise<void> {
    if (!this.client) {
      return;
    }

    // Verificar status atual
    const lead = await this.client.prospectingLead.findUnique({
      where: { id: leadId },
      select: { status: true, interestedAt: true },
    });

    if (!lead) {
      return;
    }

    // Não sobrescrever status finais
    if (this.noOverrideStatuses.includes(lead.status)) {
      return;
    }

    const updateData: any = { status: newStatus };

    // Se novo status é INTERESTED, preencher interestedAt se ainda não foi
    if (newStatus === 'INTERESTED' && !lead.interestedAt) {
      updateData.interestedAt = new Date();
    }

    await this.client.prospectingLead.update({
      where: { id: leadId },
      data: updateData,
    });
  }

  /**
   * Agendar follow-up para FOLLOW_UP e SEM_TEMPO.
   */
  private async scheduleFollowUp(leadId: bigint): Promise<void> {
    if (!this.client) {
      return;
    }

    const lead = await this.client.prospectingLead.findUnique({
      where: { id: leadId },
      select: { campaignId: true, followUpCount: true },
    });

    if (!lead) {
      return;
    }

    const campaign = await this.client.prospectingCampaign.findUnique({
      where: { id: lead.campaignId },
      select: {
        followUpEnabled: true,
        maxFollowUps: true,
        followUpAfterHours: true,
      },
    });

    if (!campaign?.followUpEnabled) {
      return;
    }

    if (lead.followUpCount >= campaign.maxFollowUps) {
      return;
    }

    // Verificar exclusão por objection
    // Isso será feito na próxima função

    const followUpHours = campaign.followUpAfterHours ?? 24;
    const nextActionAt = new Date(Date.now() + followUpHours * 60 * 60 * 1000);

    await this.client.prospectingLead.update({
      where: { id: leadId },
      data: {
        nextActionAt,
        followUpCount: { increment: 1 },
      },
    });
  }

  /**
   * Classifica texto sem persistência (preview/simulação).
   * Reutiliza o mesmo matching logic do classify().
   */
  public async classifyPreview(
    text: string,
    excludedObjectionIds: bigint[] = [],
  ): Promise<{ matched: boolean; objectionCode?: string | undefined; suggestedResponse?: string | undefined }> {
    if (!this.client) {
      return { matched: false, objectionCode: undefined, suggestedResponse: undefined };
    }

    const normalized = this.normalizeText(text);

    const patterns = await this.client.prospectingObjectionPattern.findMany({
      where: {
        objection: {
          isActive: true,
          id: { notIn: excludedObjectionIds },
        },
      },
      select: {
        objectionId: true,
        objection: {
          select: {
            publicId: true,
            code: true,
            suggestedResponse: true,
          },
        },
        patternType: true,
        pattern: true,
        priority: true,
      },
      orderBy: [{ priority: 'desc' }],
    });

    const matches = this.findMatches(normalized, patterns);
    if (matches.length === 0) {
      return { matched: false };
    }

    const bestMatch = matches[0]!;
    return {
      matched: true,
      objectionCode: bestMatch.objectionCode ?? undefined,
      suggestedResponse: bestMatch.suggestedResponse ?? undefined,
    };
  }

  /**
   * Normalizar texto para matching.
   * Reutiliza lógica de ETAPA 4.
   */
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
