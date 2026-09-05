import {
  IconBrush,
  IconCut,
  IconDental,
  IconDroplet,
  IconEyeglass,
  IconFlame,
  IconHandStop,
  IconHeartbeat,
  IconLeaf,
  IconMassage,
  IconMoodSmile,
  IconNeedle,
  IconPaint,
  IconPerfume,
  IconRazor,
  IconRazorElectric,
  IconScissors,
  IconSparkles,
  IconSpray,
  IconStethoscope,
  IconUserHeart,
  IconWash,
  IconYoga,
  type Icon,
} from '@tabler/icons-react';

/**
 * Catálogo curado: só estes identificadores são aceitos e persistidos, o que
 * evita SVG livre vindo do usuário. Manter a lista curta e pertinente.
 */
export const SERVICE_ICONS: { key: string; label: string; Icon: Icon }[] = [
  { key: 'scissors', label: 'Tesoura', Icon: IconScissors },
  { key: 'cut', label: 'Corte', Icon: IconCut },
  { key: 'razor', label: 'Navalha', Icon: IconRazor },
  { key: 'razor-electric', label: 'Máquina', Icon: IconRazorElectric },
  { key: 'beard', label: 'Barba', Icon: IconMoodSmile },
  { key: 'wash', label: 'Lavagem', Icon: IconWash },
  { key: 'droplet', label: 'Hidratação', Icon: IconDroplet },
  { key: 'spray', label: 'Finalização', Icon: IconSpray },
  { key: 'paint', label: 'Coloração', Icon: IconPaint },
  { key: 'brush', label: 'Escova', Icon: IconBrush },
  { key: 'sparkles', label: 'Estética', Icon: IconSparkles },
  { key: 'perfume', label: 'Perfumaria', Icon: IconPerfume },
  { key: 'massage', label: 'Massagem', Icon: IconMassage },
  { key: 'hand', label: 'Manicure', Icon: IconHandStop },
  { key: 'eyeglass', label: 'Sobrancelha', Icon: IconEyeglass },
  { key: 'needle', label: 'Procedimento', Icon: IconNeedle },
  { key: 'dental', label: 'Odontologia', Icon: IconDental },
  { key: 'stethoscope', label: 'Consulta', Icon: IconStethoscope },
  { key: 'heartbeat', label: 'Saúde', Icon: IconHeartbeat },
  { key: 'leaf', label: 'Bem-estar', Icon: IconLeaf },
  { key: 'yoga', label: 'Terapias', Icon: IconYoga },
  { key: 'flame', label: 'Depilação', Icon: IconFlame },
  { key: 'user-heart', label: 'Cuidado pessoal', Icon: IconUserHeart },
];

export const SERVICE_ICON_KEYS = SERVICE_ICONS.map((item) => item.key);

export function serviceIcon(key: string | null | undefined): Icon | null {
  if (key === null || key === undefined) return null;
  return SERVICE_ICONS.find((item) => item.key === key)?.Icon ?? null;
}
