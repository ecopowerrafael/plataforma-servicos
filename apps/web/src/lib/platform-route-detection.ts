/**
 * Detecta se o pathname corresponde a uma rota de detalhe na plataforma.
 * Retorna true para: professionals/:id, services/:id, combos/:id
 * Retorna false para: tenant base, tenant list, sections principais
 */
export function isPlatformDetailPath(pathname: string): boolean {
  return /\/(professionals|services|combos)\//.test(pathname);
}
