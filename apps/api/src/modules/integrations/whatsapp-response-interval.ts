export function nextAllowedReplyAt(lastAutomatedReplyAt: Date | null, intervalSeconds: number): Date | null {
  if (lastAutomatedReplyAt === null || intervalSeconds <= 0) return null;
  return new Date(lastAutomatedReplyAt.getTime() + intervalSeconds * 1000);
}

export function shouldDeferReply(lastAutomatedReplyAt: Date | null, intervalSeconds: number, now: Date): boolean {
  const next = nextAllowedReplyAt(lastAutomatedReplyAt, intervalSeconds);
  return next !== null && now.getTime() < next.getTime();
}
