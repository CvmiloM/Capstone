import { BadRequestException } from '@nestjs/common';

export function leerBusquedaBandeja(consulta: Record<string, unknown> = {}) {
  const q = consulta.q ?? '';
  const pagina = Number(consulta.pagina ?? 1);
  if (
    typeof q !== 'string' ||
    q.trim().length > 120 ||
    q.includes('\0') ||
    /[\r\n]/.test(q) ||
    !Number.isInteger(pagina) ||
    pagina < 1 ||
    pagina > 10000
  )
    throw new BadRequestException(
      'Revisa la búsqueda y la página de situaciones.',
    );
  const buscar = q.trim();
  const rut = buscar.replace(/[.\s-]/g, '').toUpperCase();
  return { buscar, rut: /^[0-9K]{1,9}$/.test(rut) ? rut : null, pagina };
}
