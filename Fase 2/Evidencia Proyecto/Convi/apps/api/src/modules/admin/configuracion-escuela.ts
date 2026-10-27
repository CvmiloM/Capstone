import { BadRequestException } from '@nestjs/common';

const ZONAS = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);

export function validarConfiguracionEscuela(cuerpo: unknown) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo))
    throw new BadRequestException('La configuración no es válida');
  const datos = cuerpo as Record<string, unknown>;
  if (
    Object.keys(datos).some(
      (c) =>
        !['zona_horaria', 'plazo_cierre_dias', 'actualizado_en'].includes(c),
    )
  )
    throw new BadRequestException(
      'Solo puedes editar la zona horaria y el plazo de tu escuela',
    );
  const errores: Record<string, string> = {};
  const zona =
    typeof datos.zona_horaria === 'string' ? datos.zona_horaria.trim() : '';
  if (!ZONAS.has(zona)) errores.zona_horaria = 'Elige una zona horaria válida';
  const entrada = datos.plazo_cierre_dias;
  const texto = typeof entrada === 'string' ? entrada.trim() : entrada;
  const plazo =
    texto === '' || texto === null
      ? null
      : typeof texto === 'number' ||
          (typeof texto === 'string' && /^\d+$/.test(texto))
        ? Number(texto)
        : NaN;
  if (
    plazo !== null &&
    (!Number.isInteger(plazo) || plazo <= 0 || plazo > 2147483647)
  )
    errores.plazo_cierre_dias =
      'Escribe una cantidad de días enteros mayor que cero o deja el campo vacío';
  const version = datos.actualizado_en;
  if (
    typeof version !== 'string' ||
    version.length > 80 ||
    !/^\d{4}-\d{2}-\d{2}[T ]/.test(version) ||
    !Number.isFinite(Date.parse(version))
  )
    throw new BadRequestException(
      'Recarga el establecimiento antes de guardar los cambios',
    );
  if (Object.keys(errores).length)
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados',
      errores,
    });
  return {
    zona_horaria: zona,
    plazo_cierre_dias: plazo,
    actualizado_en: version,
  };
}
