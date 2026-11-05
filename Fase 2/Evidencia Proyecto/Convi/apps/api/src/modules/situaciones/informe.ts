import { BadRequestException } from '@nestjs/common';
import {
  validarFiltrosIndicadores,
  type FiltrosIndicadores,
} from './indicadores.js';
import type {
  IndicadoresCalculados,
  DEFINICIONES_INDICADORES,
} from './calculo-indicadores.js';

export const TIPOS_INFORME = ['PERIODO', 'ESTUDIANTE', 'CASO'] as const;
export type TipoInforme = (typeof TIPOS_INFORME)[number];
export type AlcanceInforme = FiltrosIndicadores & {
  tipo: TipoInforme;
  estudiante: string | null;
  caso: string | null;
  nivel: string | null;
  anterior: string | null;
  solicitud: string;
};
export type PresentacionInforme = {
  titulo: string;
  subtitulo: string;
  comentarios: string;
  tema: 'azul' | 'verde';
  portada: boolean;
  tablas: boolean;
  agrupacion: 'mes' | 'dia';
  secciones: string[];
};
export type CeldaInforme = string | number | null;
export type SeccionInforme = {
  id: string;
  titulo: string;
  descripcion: string;
  columnas: string[];
  filas: CeldaInforme[][];
  grafico: 'barras' | 'lineas' | 'matriz' | null;
};
export type InstantaneaInforme = {
  version: 1;
  escuela: string;
  creador: string;
  creado_en: string;
  sujeto: string | null;
  alcance: AlcanceInforme;
  filtros_texto: string[];
  indicadores: IndicadoresCalculados;
  definiciones: typeof DEFINICIONES_INDICADORES;
  secciones: SeccionInforme[];
  hallazgos: string[];
  presentacion: PresentacionInforme;
  archivos?: { pdf: string; xlsx: string };
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function objeto(entrada: unknown): Record<string, unknown> {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada))
    throw new BadRequestException('Revisa los datos del informe');
  return entrada as Record<string, unknown>;
}
export function identificadorInforme(
  valor: unknown,
  obligatorio = false,
): string | null {
  if (!obligatorio && (valor === undefined || valor === null || valor === ''))
    return null;
  if (typeof valor !== 'string' || !UUID.test(valor))
    throw new BadRequestException('Selecciona un registro válido');
  return valor;
}
export function validarAlcanceInforme(entrada: unknown): AlcanceInforme {
  const d = objeto(entrada);
  const filtros = validarFiltrosIndicadores(d);
  if (!filtros.desde || !filtros.hasta)
    throw new BadRequestException(
      'Selecciona Desde y Hasta antes de consultar',
    );
  if (!TIPOS_INFORME.includes(d.tipo as TipoInforme))
    throw new BadRequestException('Elige el propósito del informe');
  const tipo = d.tipo as TipoInforme;
  const estudiante = identificadorInforme(d.estudiante, tipo === 'ESTUDIANTE');
  const caso = identificadorInforme(d.caso, tipo === 'CASO');
  const nivel = identificadorInforme(d.nivel);
  if (
    (tipo !== 'ESTUDIANTE' && estudiante) ||
    (tipo !== 'CASO' && caso) ||
    (tipo !== 'PERIODO' && (nivel || filtros.curso || filtros.categoria))
  )
    throw new BadRequestException(
      'Los filtros no corresponden al propósito elegido',
    );
  return {
    ...filtros,
    tipo,
    estudiante,
    caso,
    nivel,
    anterior: identificadorInforme(d.anterior),
    solicitud: identificadorInforme(d.solicitud, true)!,
  };
}
function texto(valor: unknown, maximo: number, requerido = false) {
  if (valor === undefined && !requerido) return '';
  if (
    typeof valor !== 'string' ||
    valor.length > maximo ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(valor) ||
    (requerido && !valor.trim())
  )
    throw new BadRequestException(
      'Revisa el título, subtítulo o los comentarios',
    );
  return valor.trim();
}
export function validarPresentacionInforme(
  entrada: unknown,
  disponibles: string[],
): PresentacionInforme {
  const d = objeto(entrada);
  if (
    !Array.isArray(d.secciones) ||
    !d.secciones.length ||
    d.secciones.length > disponibles.length ||
    d.secciones.some(
      (s) => typeof s !== 'string' || !disponibles.includes(s),
    ) ||
    new Set(d.secciones).size !== d.secciones.length
  )
    throw new BadRequestException('Elige al menos una sección disponible');
  if (
    !['azul', 'verde'].includes(d.tema as string) ||
    !['mes', 'dia'].includes(d.agrupacion as string) ||
    typeof d.portada !== 'boolean' ||
    typeof d.tablas !== 'boolean'
  )
    throw new BadRequestException('Revisa las opciones de presentación');
  return {
    titulo: texto(d.titulo, 220, true),
    subtitulo: texto(d.subtitulo, 300),
    comentarios: texto(d.comentarios, 5000),
    tema: d.tema as 'azul' | 'verde',
    agrupacion: d.agrupacion as 'mes' | 'dia',
    portada: d.portada,
    tablas: d.tablas,
    secciones: d.secciones as string[],
  };
}

export function serieCompleta(
  desde: string,
  hasta: string,
  unidad: 'mes' | 'dia',
  datos: { fecha?: string; mes?: string; total: number }[],
) {
  const totales = new Map(datos.map((f) => [f.fecha ?? f.mes!, f.total]));
  const fecha = new Date(desde + 'T12:00:00Z');
  if (unidad === 'mes') fecha.setUTCDate(1);
  const limite = unidad === 'mes' ? hasta.slice(0, 7) : hasta;
  const filas: [string, number][] = [];
  while (fecha.toISOString().slice(0, unidad === 'mes' ? 7 : 10) <= limite) {
    const clave = fecha.toISOString().slice(0, unidad === 'mes' ? 7 : 10);
    filas.push([clave, totales.get(clave) ?? 0]);
    if (unidad === 'mes') fecha.setUTCMonth(fecha.getUTCMonth() + 1);
    else fecha.setUTCDate(fecha.getUTCDate() + 1);
  }
  return filas;
}

export function seccionesIndicadores(
  d: IndicadoresCalculados,
): SeccionInforme[] {
  const grupos = [
    ['categorias', 'Situaciones por categoría', d.por_categoria],
    ['cursos', 'Situaciones por curso', d.por_curso],
    ['niveles', 'Situaciones por nivel educativo', d.por_nivel],
    ['lugares', 'Situaciones por lugar', d.por_lugar],
  ] as const;
  const meses = serieCompleta(d.desde, d.hasta, 'mes', d.por_mes);
  const dias = serieCompleta(d.desde, d.hasta, 'dia', d.por_dia);
  const categorias = d.por_categoria.map((f) => f.nombre);
  const matriz = new Map(
    d.categorias_por_mes.map((f) => [
      JSON.stringify([f.nombre, f.mes]),
      f.total,
    ]),
  );
  const estados = (nombre: string, e: IndicadoresCalculados['compromisos']) => [
    [nombre + ' vencidos', e.vencidos],
    [nombre + ' pendientes', e.pendientes],
    [nombre + ' completados', e.completados],
    [nombre + ' cancelados', e.cancelados],
  ];
  return [
    {
      id: 'resumen',
      titulo: 'Resumen del período',
      descripcion: 'Cifras calculadas en el servidor para el alcance elegido',
      columnas: ['Indicador', 'Valor', 'Denominador o unidad'],
      grafico: null,
      filas: [
        ['Situaciones', d.total_situaciones, 'Situaciones distintas'],
        [
          'Compromisos vencidos',
          d.compromisos.vencidos,
          d.compromisos.total + ' compromisos',
        ],
        [
          'Seguimientos pendientes',
          d.seguimientos.pendientes,
          d.seguimientos.total + ' seguimientos',
        ],
        [
          'Cierres oportunos',
          d.cierres.porcentaje_oportunos,
          d.cierres.oportunos +
            ' de ' +
            d.cierres.con_plazo +
            ' con plazo, ' +
            d.cierres.sin_plazo +
            ' sin plazo excluidos, porcentaje',
        ],
        [
          'Tiempo de gestión promedio',
          d.gestion.dias_promedio,
          d.gestion.casos_cerrados +
            ' casos actualmente cerrados, días calendario',
        ],
        [
          'Cierres registrados',
          d.movimientos.cierres,
          d.movimientos.casos_con_cierre + ' casos distintos',
        ],
        [
          'Reaperturas registradas',
          d.movimientos.reaperturas,
          d.movimientos.casos_reabiertos + ' casos distintos',
        ],
      ],
    },
    {
      id: 'evolucion_mes',
      titulo: 'Evolución mensual de situaciones',
      descripcion: 'Incluye meses sin registros como cero, fecha del hecho',
      columnas: ['Mes', 'Situaciones'],
      filas: meses,
      grafico: 'barras',
    },
    {
      id: 'evolucion_dia',
      titulo: 'Evolución diaria de situaciones',
      descripcion: 'Incluye días sin registros como cero, fecha del hecho',
      columnas: ['Día', 'Situaciones'],
      filas: dias,
      grafico: dias.length >= 4 ? 'lineas' : 'barras',
    },
    ...grupos.map(([id, titulo, grupo]) => ({
      id,
      titulo,
      descripcion:
        'Cantidades absolutas, cada situación cuenta una vez, no corresponde a una tasa por matrícula',
      columnas: ['Grupo', 'Situaciones'],
      filas: grupo.map((f) => [f.nombre, f.total]),
      grafico: 'barras' as const,
    })),
    {
      id: 'categorias_mes',
      titulo: 'Categorías a través de los meses',
      descripcion:
        'Cada celda muestra situaciones registradas, mayor intensidad significa más registros',
      columnas: ['Categoría', ...meses.map((f) => f[0])],
      filas: categorias.map((c) => [
        c,
        ...meses.map((m) => matriz.get(JSON.stringify([c, m[0]])) ?? 0),
      ]),
      grafico: 'matriz',
    },
    {
      id: 'comparacion',
      titulo: 'Comparación con el período anterior',
      descripcion:
        'Actual del ' +
        d.desde +
        ' al ' +
        d.hasta +
        ', anterior del ' +
        d.comparacion.desde +
        ' al ' +
        d.comparacion.hasta +
        ', ambos de ' +
        d.comparacion.dias +
        ' días',
      columnas: ['Indicador', 'Anterior', 'Actual', 'Variación porcentual'],
      filas: d.comparacion.indicadores.map((f) => [
        f.nombre,
        f.anterior,
        f.actual,
        f.variacion_porcentual,
      ]),
      grafico: null,
    },
    {
      id: 'gestion',
      titulo: 'Compromisos y seguimientos',
      descripcion:
        'Estados actuales según fecha de vencimiento o fecha programada dentro del período',
      columnas: ['Estado', 'Cantidad'],
      filas: [
        ...estados('Compromisos', d.compromisos),
        ...estados('Seguimientos', d.seguimientos),
      ],
      grafico: 'barras',
    },
  ];
}
export function hallazgosInforme(d: IndicadoresCalculados): string[] {
  const frases = [
    d.total_situaciones
      ? 'Se registraron ' +
        d.total_situaciones +
        ' situaciones distintas dentro del período elegido'
      : 'No hay situaciones registradas para este período y alcance',
  ];
  const meses = serieCompleta(d.desde, d.hasta, 'mes', d.por_mes);
  const maximo = Math.max(0, ...meses.map((f) => f[1]));
  const picos = meses.filter((f) => f[1] === maximo);
  if (maximo)
    frases.push(
      'El mayor conteo mensual fue ' +
        maximo +
        ', registrado en ' +
        picos.map((f) => f[0]).join(', '),
    );
  if (d.por_nivel.length && d.total_situaciones) {
    const mayor = d.por_nivel[0].total;
    frases.push(
      'El mayor conteo por nivel corresponde a ' +
        d.por_nivel
          .filter((f) => f.total === mayor)
          .map((f) => f.nombre)
          .join(', ') +
        ', con ' +
        mayor +
        ' situaciones, son cantidades absolutas y no tasas por matrícula',
    );
  }
  const mapa = new Map(
    d.categorias_por_mes.map((f) => [
      JSON.stringify([f.nombre, f.mes]),
      f.total,
    ]),
  );
  const aumentos = d.por_categoria
    .flatMap((c) =>
      meses.slice(1).map((m, i) => ({
        categoria: c.nombre,
        mes: m[0],
        anterior: mapa.get(JSON.stringify([c.nombre, meses[i][0]])) ?? 0,
        actual: mapa.get(JSON.stringify([c.nombre, m[0]])) ?? 0,
      })),
    )
    .filter((f) => f.actual > f.anterior)
    .sort((a, b) => b.actual - b.anterior - (a.actual - a.anterior));
  if (aumentos.length) {
    const a = aumentos[0];
    frases.push(
      'El mayor aumento mensual observado por categoría corresponde a ' +
        a.categoria +
        ' en ' +
        a.mes +
        ', de ' +
        a.anterior +
        ' a ' +
        a.actual +
        ' registros, los meses de inicio y término pueden ser parciales',
    );
  }
  if (d.cierres.con_plazo)
    frases.push(
      d.cierres.oportunos +
        ' de ' +
        d.cierres.con_plazo +
        ' casos con plazo cerraron oportunamente, ' +
        d.cierres.sin_plazo +
        ' casos sin plazo se excluyen del porcentaje',
    );
  frases.push(
    'Las cifras describen registros disponibles al momento del cálculo, no determinan causas ni predicen la conducta de estudiantes',
  );
  return frases;
}

export function seccionesDelInforme(d: InstantaneaInforme) {
  return d.secciones
    .filter(
      (s) =>
        d.presentacion.secciones.includes(s.id) && s.id !== 'evolucion_dia',
    )
    .map((s) =>
      s.id === 'evolucion_mes' && d.presentacion.agrupacion === 'dia'
        ? {
            ...d.secciones.find((f) => f.id === 'evolucion_dia')!,
            id: 'evolucion_mes',
          }
        : s,
    );
}
