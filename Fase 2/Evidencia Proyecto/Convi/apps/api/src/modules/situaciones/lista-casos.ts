import { BadRequestException } from '@nestjs/common';

export const CASOS_POR_PAGINA = 10;
const ESTADOS = [
  'EN_ANALISIS',
  'EN_REVISION',
  'EN_INTERVENCION',
  'EN_SEGUIMIENTO',
  'CERRADO',
  'REABIERTO',
];

export function leerFiltrosCasos(consulta: Record<string, unknown>) {
  function texto(campo: string, maximo: number) {
    const valor = consulta[campo];
    if (valor === undefined || valor === '') return '';
    if (typeof valor !== 'string' || valor.length > maximo)
      throw new BadRequestException('Revisa los filtros de casos');
    return valor.trim();
  }
  const nombre = texto('nombre', 120);
  const rutOriginal = texto('rut', 20);
  const rut = rutOriginal.replace(/[.\s-]/g, '').toUpperCase();
  const responsable = texto('responsable', 36);
  const estado = texto('estado', 30);
  const anio = texto('anio', 4);
  const fecha = texto('fecha', 10);
  const pagina = texto('pagina', 7) || '1';
  if (
    (rutOriginal && !/^[0-9K]{1,9}$/.test(rut)) ||
    (responsable &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        responsable,
      )) ||
    (estado && !ESTADOS.includes(estado)) ||
    (anio && !/^[1-9]\d{3}$/.test(anio)) ||
    (fecha &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
        fecha.startsWith('0000') ||
        !Number.isFinite(Date.parse(fecha)) ||
        new Date(fecha).toISOString().slice(0, 10) !== fecha)) ||
    !/^[1-9]\d{0,6}$/.test(pagina)
  )
    throw new BadRequestException(
      'Revisa el RUT, las fechas y las opciones de los filtros',
    );
  return {
    nombre,
    rut,
    responsable,
    estado,
    anio,
    fecha,
    pagina: Number(pagina),
  };
}

export function valoresFiltrosCasos(f: ReturnType<typeof leerFiltrosCasos>) {
  // LIKE busca texto literal, los comodines escritos por el usuario no amplían la búsqueda.
  const literal = (texto: string) => texto.replace(/[\\%_]/g, '\\$&');
  return [
    f.nombre ? `%${literal(f.nombre)}%` : '',
    f.rut,
    f.responsable || null,
    f.estado,
    f.anio ? `${f.anio}-01-01` : null,
    f.anio ? `${Number(f.anio) + 1}-01-01` : null,
    f.fecha || null,
    f.pagina,
    CASOS_POR_PAGINA,
  ];
}

export const CONDICIONES_CASOS = `
  c.establecimiento_id = $10::uuid
  AND ($1 = '' OR c.titulo ILIKE $1 OR c.codigo ILIKE $1 OR EXISTS (
    SELECT 1 FROM convi.participaciones pa JOIN convi.estudiantes e ON e.persona_id = pa.persona_id
    JOIN convi.personas p ON p.id = pa.persona_id
    WHERE pa.caso_id = c.id AND pa.activo_hasta IS NULL AND p.nombres || ' ' || p.apellidos ILIKE $1))
  AND ($2 = '' OR EXISTS (
    SELECT 1 FROM convi.participaciones pa JOIN convi.estudiantes e ON e.persona_id = pa.persona_id
    JOIN convi.personas p ON p.id = pa.persona_id
    WHERE pa.caso_id = c.id AND pa.activo_hasta IS NULL
    AND translate(upper(p.rut), '.- ', '') LIKE $2 || '%'))
  AND ($3::uuid IS NULL OR c.asignado_a_membresia_id = $3)
  AND ($4 = '' OR c.estado_actual = $4)
  AND ($5::date IS NULL OR c.fecha_inicio >= $5)
  AND ($6::date IS NULL OR c.fecha_inicio < $6)
  AND ($7::date IS NULL OR c.fecha_inicio = $7)`;
