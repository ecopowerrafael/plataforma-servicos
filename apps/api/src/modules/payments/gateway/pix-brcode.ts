/**
 * Geração local do payload PIX "BR Code" (padrão EMV QR Code do Banco Central, usado tanto
 * para o QR Code quanto para o "copia e cola"). Implementação própria, sem nenhuma API
 * bancária externa — apenas formatação de string e checksum CRC16, ambos determinísticos.
 */

function tlv(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function sanitizeAscii(value: string, maxLength: number): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^\x20-\x7E]/gu, '')
    .trim()
    .slice(0, maxLength);
}

export interface PixBrCodeInput {
  pixKey: string;
  receiverName: string;
  city: string;
  amountCents: bigint;
  referenceId: string;
  description?: string | null;
}

export function buildPixBrCode(input: PixBrCodeInput): string {
  const receiverName = sanitizeAscii(input.receiverName, 25) || 'RECEBEDOR';
  const city = sanitizeAscii(input.city, 15) || 'BRASIL';
  const referenceId = input.referenceId.replace(/[^A-Za-z0-9]/gu, '').slice(0, 25) || '***';
  const amount = (Number(input.amountCents) / 100).toFixed(2);

  const merchantAccountFields = [
    tlv('00', 'br.gov.bcb.pix'),
    tlv('01', input.pixKey),
    ...(input.description === null || input.description === undefined || input.description === ''
      ? []
      : [tlv('02', sanitizeAscii(input.description, 72))]),
  ].join('');

  const additionalDataFields = tlv('05', referenceId);

  const payloadWithoutCrc =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('26', merchantAccountFields) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', amount) +
    tlv('58', 'BR') +
    tlv('59', receiverName) +
    tlv('60', city) +
    tlv('62', additionalDataFields) +
    '6304';

  return payloadWithoutCrc + crc16(payloadWithoutCrc);
}
