export function normalizeWhatsAppPhone(value: string): string | null {
  const digits = value.replace(/\D/gu, '');
  if (value.trimStart().startsWith('+'))
    return digits.length >= 10 && digits.length <= 15 ? digits : null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}
