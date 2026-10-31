import { BadRequestException } from '@nestjs/common';

// PB-093 (HU-080) y PB-095 (HU-082): atención de alertas y lectura de avisos
// de Convivencia. Se valida aquí para responder con errores por campo; la base
// vuelve a exigir Convivencia activa, fecha y observación al revisar una
// alerta, que solo cambie su revisión, que la observación no cambie después, y
// que del aviso solo cambie la fecha de lectura, una vez y por su destinatario.

/** Huella de la alerta que se veía (md5 de la fila), para PB-139. */
const VERSION = /^[0-9a-f]{32}$/;

// Decisión del PO (por defecto): 20 por página y hasta 4.000 caracteres.
export const POR_PAGINA_ALERTAS = 20;
export const POR_PAGINA_AVISOS = 20;
export const LARGO_MAXIMO_OBSERVACION_ALERTA = 4000;

/** NUEVA al generarse; REVISADA y ARCHIVADO son finales (por defecto). */
export const ESTADOS_ALERTA = ['NUEVA', 'REVISADA', 'ARCHIVADO'] as const;
export const ESTADOS_REVISION = ['REVISADA', 'ARCHIVADO'] as const;

export type RevisionAlerta = {
  estado_nuevo: (typeof ESTADOS_REVISION)[number];
  observacion: string;
  version: string;
};

function datosDe(cuerpo: unknown) {
  return (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function pagina(consulta: Record<string, unknown>) {
  const valor = consulta.pagina;
  if (valor === undefined || valor === '') return 1;
  if (typeof valor !== 'string' || !/^[1-9]\d{0,6}$/.test(valor))
    throw new BadRequestException('Revisa la página pedida.');
  return Number(valor);
}

/** Bandeja de alertas: Nuevas al entrar; TODAS muestra todos los estados. */
export function leerFiltrosAlertas(consulta: Record<string, unknown> = {}) {
  const estado = consulta.estado ?? 'NUEVA';
  if (estado !== 'TODAS' && !ESTADOS_ALERTA.some((e) => e === estado))
    throw new BadRequestException('Revisa el estado de las alertas.');
  return {
    estado: estado === 'TODAS' ? null : (estado as string),
    pagina: pagina(consulta),
  };
}

/** Avisos: solo los no leídos al entrar, o todos los propios. */
export function leerFiltrosAvisos(consulta: Record<string, unknown> = {}) {
  const ver = consulta.ver ?? 'no-leidos';
  if (ver !== 'no-leidos' && ver !== 'todos')
    throw new BadRequestException('Revisa el filtro de los avisos.');
  return { todos: ver === 'todos', pagina: pagina(consulta) };
}

// CA2 y CA3: se marca Revisada o Archivada escribiendo qué se hizo. La
// pantalla envía la huella de lo que se veía para no pisar otra revisión.
export function validarRevisionAlerta(cuerpo: unknown): RevisionAlerta {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const estado = ESTADOS_REVISION.find((e) => e === datos.estado_nuevo);
  if (!estado)
    errores.estado_nuevo = 'Elige si la alerta queda revisada o archivada.';
  const observacion = texto(datos.observacion);
  if (!observacion) errores.observacion = 'Escribe qué se hizo con la alerta.';
  else if (observacion.length > LARGO_MAXIMO_OBSERVACION_ALERTA)
    errores.observacion = `El texto admite hasta ${LARGO_MAXIMO_OBSERVACION_ALERTA} caracteres.`;
  const vista =
    typeof datos.version === 'string' && VERSION.test(datos.version)
      ? datos.version
      : null;
  if (!vista)
    errores.estado_nuevo = 'Recarga la página e inténtalo nuevamente.';
  if (!estado || !vista || Object.keys(errores).length > 0)
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. La alerta no cambió.',
      errores,
    });
  return { estado_nuevo: estado, observacion, version: vista };
}
