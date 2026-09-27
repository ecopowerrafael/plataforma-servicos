import { createElement } from 'react';

import { serviceIcon } from './service-icons.js';
import { environment } from '../../config/environment.js';

/**
 * Prioridade de apresentação: imagem cadastrada → ícone do catálogo → inicial.
 * O ícone herda a cor do tema pelo `currentColor`.
 */
export function ServiceVisual({
  name,
  imageUrl,
  iconKey,
  className = '',
}: {
  name: string;
  imageUrl: string | null;
  iconKey: string | null;
  className?: string;
}) {
  const icon = serviceIcon(iconKey);
  return (
    <span className={`service-visual ${className}`.trim()} aria-hidden="true">
      {imageUrl !== null ? (
        <img alt="" src={`${environment.apiUrl}${imageUrl}`} />
      ) : icon !== null ? (
        createElement(icon, { size: 28, stroke: 1.5 })
      ) : (
        <b>{name.slice(0, 1).toLocaleUpperCase('pt-BR')}</b>
      )}
    </span>
  );
}
