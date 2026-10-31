import { BadRequestException } from '@nestjs/common';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^[0-9a-f]{32}$/;
export const LARGO_MOTIVO_CONTINUIDAD = 500;

function leer(cuerpo: unknown) {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const motivo = typeof datos.motivo === 'string' ? datos.motivo.trim() : '';
  const errores: Record<string, string> = {};
  if (!motivo) errores.motivo = 'Explica el motivo de esta decisión';
  else if (motivo.length > LARGO_MOTIVO_CONTINUIDAD)
    errores.motivo = `El motivo admite hasta ${LARGO_MOTIVO_CONTINUIDAD} caracteres`;
  return { datos, motivo, errores };
}

export function validarReapertura(cuerpo: unknown) {
  const { datos, motivo, errores } = leer(cuerpo);
  const anterior = datos.movimiento_anterior_id;
  if (
    anterior !== null &&
    anterior !== '' &&
    !(typeof anterior === 'string' && UUID.test(anterior))
  )
    errores.motivo = 'Recarga el caso antes de reabrirlo';
  if (Object.keys(errores).length)
    throw new BadRequestException({
      mensaje: 'Revisa los datos, el caso no se reabrió',
      errores,
    });
  return {
    motivo,
    movimiento_anterior_id:
      typeof anterior === 'string' && anterior ? anterior.toLowerCase() : null,
  };
}

export function validarReasignacion(cuerpo: unknown) {
  const { datos, motivo, errores } = leer(cuerpo);
  const responsable =
    typeof datos.responsable_id === 'string' ? datos.responsable_id : '';
  const version =
    typeof datos.version_responsable === 'string'
      ? datos.version_responsable
      : '';
  if (!UUID.test(responsable))
    errores.responsable_id =
      'Elige a la nueva persona responsable de Convivencia';
  if (!VERSION.test(version))
    errores.motivo = 'Recarga el caso antes de reasignarlo';
  if (Object.keys(errores).length)
    throw new BadRequestException({
      mensaje: 'Revisa los datos, el responsable no cambió',
      errores,
    });
  return {
    motivo,
    responsable_id: responsable.toLowerCase(),
    version_responsable: version,
  };
}
