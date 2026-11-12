import { BadRequestException } from '@nestjs/common';

// Analítica de Convivencia: la historia de la escuela en gráficos, sin límite
// de un año como los indicadores. Evolución mensual de las situaciones,
// comparación de un año con otro, categorías por año y duración de los casos.
// Solo cifras agrupadas, sin nombres ni registros, calculadas con las tablas
// existentes (situaciones y casos) y la seguridad por fila de la escuela.

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Años hacia atrás que mira la analítica, contando el actual. */
export const ANIOS_ANALITICA = 10;

export function validarFiltrosAnalitica(datos: Record<string, unknown>): {
  categoria: string | null;
} {
  const categoria = datos.categoria;
  if (categoria === undefined || categoria === '') return { categoria: null };
  if (typeof categoria !== 'string' || !UUID.test(categoria))
    throw new BadRequestException('Revisa la categoría');
  return { categoria };
}

/** Tramos de duración de un caso, en días calendario. */
export const TRAMOS_DURACION = [
  { nombre: 'Menos de 1 mes', hasta: 30 },
  { nombre: '1 a 3 meses', hasta: 90 },
  { nombre: '3 a 6 meses', hasta: 180 },
  { nombre: '6 meses a 1 año', hasta: 365 },
  { nombre: 'Más de 1 año', hasta: null },
] as const;

const TRAMO_SQL = TRAMOS_DURACION.map((t, i) =>
  t.hasta === null ? `ELSE ${i}` : `WHEN dias < ${t.hasta} THEN ${i}`,
).join(' ');

// Una situación cuenta una vez, como en los indicadores. Las fechas usan la
// zona horaria de la escuela, que CuentaService deja en la sesión. Los casos
// se filtran por categoría si la principal o alguna de sus situaciones la tiene.
export const CONSULTA_ANALITICA = `
WITH parametros AS (
  SELECT $1::uuid categoria,
         (date_trunc('year', current_date) - interval '${ANIOS_ANALITICA - 1} years')::date inicio
), hechos AS MATERIALIZED (
  SELECT s.ocurrido_en::date fecha, s.categoria_id
  FROM convi.situaciones s, parametros p
  WHERE s.ocurrido_en >= p.inicio::timestamptz
    AND s.ocurrido_en < (current_date + 1)::timestamptz
    AND (p.categoria IS NULL OR s.categoria_id = p.categoria)
), casos_ambito AS MATERIALIZED (
  SELECT c.id, c.estado_actual = 'CERRADO' AND c.cerrado_en IS NOT NULL cerrado,
         c.abierto_en::date abierto, c.cerrado_en::date fecha_cierre
  FROM convi.casos c, parametros p
  WHERE c.abierto_en >= p.inicio::timestamptz
    AND (p.categoria IS NULL OR c.categoria_principal_id = p.categoria
      OR EXISTS (SELECT 1 FROM convi.situaciones s
                 WHERE s.caso_id = c.id AND s.categoria_id = p.categoria))
), duraciones AS (
  SELECT cerrado, abierto,
         (CASE WHEN cerrado THEN fecha_cierre ELSE current_date END) - abierto dias
  FROM casos_ambito
), meses AS (
  SELECT generate_series(
    coalesce((SELECT date_trunc('month', min(fecha))::date FROM hechos),
             date_trunc('month', current_date)::date),
    date_trunc('month', current_date)::date, interval '1 month')::date mes
)
SELECT current_timestamp AS calculado_en,
  current_setting('TimeZone') AS zona_horaria,
  to_char(current_date, 'YYYY-MM-DD') AS hoy,
  (SELECT count(*)::int FROM hechos) AS total_situaciones,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('mes', to_char(m.mes, 'YYYY-MM'),
      'total', coalesce(x.total, 0)) ORDER BY m.mes), '[]'::jsonb)
   FROM meses m LEFT JOIN (SELECT date_trunc('month', fecha)::date mes, count(*)::int total
                           FROM hechos GROUP BY 1) x ON x.mes = m.mes) AS por_mes,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('anio', anio, 'nombre', nombre, 'total', total)
      ORDER BY anio, nombre), '[]'::jsonb)
   FROM (SELECT extract(year FROM h.fecha)::int anio,
                coalesce(c.nombre, 'Sin especificar') nombre, count(*)::int total
         FROM hechos h LEFT JOIN convi.categorias_convivencia c ON c.id = h.categoria_id
         GROUP BY 1, 2) x) AS categorias_por_anio,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('tramo', tramo, 'cerrados', cerrados,
      'abiertos', abiertos) ORDER BY tramo), '[]'::jsonb)
   FROM (SELECT CASE ${TRAMO_SQL} END tramo,
                count(*) FILTER (WHERE cerrado)::int cerrados,
                count(*) FILTER (WHERE NOT cerrado)::int abiertos
         FROM duraciones GROUP BY 1) x) AS duracion,
  (SELECT jsonb_build_object(
      'cerrados', count(*) FILTER (WHERE cerrado)::int,
      'abiertos', count(*) FILTER (WHERE NOT cerrado)::int,
      'mediana_cerrados', percentile_cont(0.5) WITHIN GROUP (ORDER BY dias) FILTER (WHERE cerrado),
      'promedio_cerrados', round(avg(dias) FILTER (WHERE cerrado), 1),
      'abierto_mas_antiguo', max(dias) FILTER (WHERE NOT cerrado))
   FROM duraciones) AS resumen_casos,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('anio', anio, 'abiertos', abiertos,
      'cerrados', cerrados) ORDER BY anio), '[]'::jsonb)
   FROM (SELECT extract(year FROM abierto)::int anio, count(*)::int abiertos,
                count(*) FILTER (WHERE cerrado)::int cerrados
         FROM duraciones GROUP BY 1) x) AS casos_por_anio,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre) ORDER BY nombre), '[]'::jsonb)
   FROM convi.categorias_convivencia WHERE estado = 'ACTIVO') AS categorias`;

type Fila = {
  calculado_en: string;
  zona_horaria: string;
  hoy: string;
  total_situaciones: number;
  por_mes: { mes: string; total: number }[];
  categorias_por_anio: { anio: number; nombre: string; total: number }[];
  duracion: { tramo: number; cerrados: number; abiertos: number }[];
  resumen_casos: {
    cerrados: number;
    abiertos: number;
    mediana_cerrados: number | null;
    promedio_cerrados: number | string | null;
    abierto_mas_antiguo: number | null;
  };
  casos_por_anio: { anio: number; abiertos: number; cerrados: number }[];
  categorias: { id: string; nombre: string }[];
};

const numero = (valor: number | string | null) =>
  valor === null ? null : Number(valor);

/**
 * Ordena lo que entrega la consulta para los gráficos: cada año con sus 12
 * meses (null en los meses que aún no llegan), las categorías con su total y
 * su serie por año, y los cinco tramos de duración aunque alguno quede en cero.
 */
export function armarAnalitica(fila: Fila) {
  const mesActual = fila.hoy.slice(0, 7);
  const anios = [
    ...new Set(fila.por_mes.map((m) => Number(m.mes.slice(0, 4)))),
  ];
  const porAnio = anios.map((anio) => {
    const meses = Array.from({ length: 12 }, (_, i) => {
      const mes = `${anio}-${String(i + 1).padStart(2, '0')}`;
      if (mes > mesActual) return null;
      return fila.por_mes.find((m) => m.mes === mes)?.total ?? 0;
    });
    return {
      anio,
      meses,
      total: meses.reduce<number>((suma, valor) => suma + (valor ?? 0), 0),
    };
  });

  const nombres = [...new Set(fila.categorias_por_anio.map((c) => c.nombre))];
  const categorias = nombres
    .map((nombre) => {
      const serie = anios.map(
        (anio) =>
          fila.categorias_por_anio.find(
            (c) => c.nombre === nombre && c.anio === anio,
          )?.total ?? 0,
      );
      return {
        nombre,
        total: serie.reduce((a, b) => a + b, 0),
        por_anio: serie,
      };
    })
    .sort(
      (a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'),
    );

  return {
    calculado_en: fila.calculado_en,
    zona_horaria: fila.zona_horaria,
    hoy: fila.hoy,
    total_situaciones: fila.total_situaciones,
    por_mes: fila.por_mes,
    anios: porAnio,
    categorias,
    duracion: TRAMOS_DURACION.map((t, i) => {
      const tramo = fila.duracion.find((d) => d.tramo === i);
      return {
        nombre: t.nombre,
        cerrados: tramo?.cerrados ?? 0,
        abiertos: tramo?.abiertos ?? 0,
      };
    }),
    resumen_casos: {
      cerrados: fila.resumen_casos.cerrados,
      abiertos: fila.resumen_casos.abiertos,
      mediana_cerrados: numero(fila.resumen_casos.mediana_cerrados),
      promedio_cerrados: numero(fila.resumen_casos.promedio_cerrados),
      abierto_mas_antiguo: fila.resumen_casos.abierto_mas_antiguo,
    },
    casos_por_anio: fila.casos_por_anio,
    opciones: { categorias: fila.categorias },
  };
}

export type Analitica = ReturnType<typeof armarAnalitica>;
export type FilaAnalitica = Fila;
