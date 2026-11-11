import ExcelJS from 'exceljs';
import { extractText } from 'unpdf';
import { writeFile } from 'node:fs/promises';
import {
  DEFINICIONES_INDICADORES,
  type IndicadoresCalculados,
} from './calculo-indicadores.js';
import { generarPdfInforme, generarXlsxInforme } from './informe-archivos.js';
import {
  AVISO_HALLAZGOS,
  hallazgosElegidos,
  hallazgosInforme,
  seccionesDelInforme,
  seccionesIndicadores,
  serieCompleta,
  validarAlcanceInforme,
  validarPresentacionInforme,
  type InstantaneaInforme,
} from './informe.js';

const id = '00000000-0000-4000-8000-000000000001';
const vacio = {
  total: 0,
  vencidos: 0,
  pendientes: 0,
  completados: 0,
  cancelados: 0,
};
function muestra(): InstantaneaInforme {
  const indicadores: IndicadoresCalculados = {
    desde: '2026-03-01',
    hasta: '2026-08-31',
    calculado_en: '2026-11-05T00:00:00Z',
    zona_horaria: 'America/Santiago',
    total_situaciones: 15,
    opciones: { cursos: [], categorias: [] },
    por_dia: [
      { fecha: '2026-03-02', total: 2 },
      { fecha: '2026-04-03', total: 3 },
      { fecha: '2026-06-05', total: 5 },
      { fecha: '2026-07-06', total: 1 },
      { fecha: '2026-08-07', total: 4 },
    ],
    por_mes: [
      { mes: '2026-03', total: 2 },
      { mes: '2026-04', total: 3 },
      { mes: '2026-06', total: 5 },
      { mes: '2026-07', total: 1 },
      { mes: '2026-08', total: 4 },
    ],
    por_categoria: [
      { nombre: 'Conflicto verbal', total: 10 },
      { nombre: 'Convivencia digital', total: 5 },
    ],
    por_nivel: [
      { nombre: 'Séptimo básico', total: 9 },
      { nombre: 'Octavo básico', total: 6 },
    ],
    por_curso: [
      { nombre: '7° A', total: 9 },
      { nombre: '8° B', total: 6 },
    ],
    por_lugar: [
      { nombre: 'Patio', total: 8 },
      { nombre: 'Sala de clases', total: 7 },
    ],
    categorias_por_mes: [
      { nombre: 'Conflicto verbal', mes: '2026-03', total: 2 },
      { nombre: 'Conflicto verbal', mes: '2026-04', total: 3 },
      { nombre: 'Conflicto verbal', mes: '2026-06', total: 5 },
      { nombre: 'Convivencia digital', mes: '2026-07', total: 1 },
      { nombre: 'Convivencia digital', mes: '2026-08', total: 4 },
    ],
    comparacion: {
      desde: '2025-08-29',
      hasta: '2026-02-28',
      dias: 184,
      indicadores: [
        {
          nombre: 'Situaciones',
          actual: 15,
          anterior: 0,
          variacion_porcentual: null,
        },
        {
          nombre: 'Cierres',
          actual: 4,
          anterior: 2,
          variacion_porcentual: 100,
        },
        {
          nombre: 'Reaperturas',
          actual: 1,
          anterior: 0,
          variacion_porcentual: null,
        },
      ],
    },
    gestion: { casos_cerrados: 3, dias_promedio: 7.7 },
    movimientos: {
      cierres: 4,
      casos_con_cierre: 3,
      reaperturas: 1,
      casos_reabiertos: 1,
    },
    compromisos: {
      total: 5,
      vencidos: 1,
      pendientes: 1,
      completados: 3,
      cancelados: 0,
    },
    seguimientos: {
      total: 4,
      vencidos: 1,
      pendientes: 2,
      completados: 1,
      cancelados: 0,
    },
    cierres: {
      total: 3,
      con_plazo: 2,
      sin_plazo: 1,
      oportunos: 1,
      porcentaje_oportunos: 50,
    },
  };
  const secciones = seccionesIndicadores(indicadores);
  return {
    version: 1,
    escuela: 'Escuela de demostración, datos sintéticos',
    creador: 'Equipo de Convivencia',
    creado_en: '2026-11-05T00:00:00Z',
    sujeto: null,
    alcance: {
      tipo: 'PERIODO',
      desde: indicadores.desde,
      hasta: indicadores.hasta,
      curso: null,
      categoria: null,
      nivel: null,
      estudiante: null,
      caso: null,
      anterior: null,
      solicitud: id,
    },
    filtros_texto: [
      'Datos ficticios para verificar el diseño',
      'Todos los cursos y categorías',
    ],
    indicadores,
    definiciones: DEFINICIONES_INDICADORES,
    secciones,
    hallazgos: hallazgosInforme(indicadores),
    presentacion: {
      titulo: 'Convivencia escolar, lectura del período',
      subtitulo: 'Marzo a agosto · Documento de demostración',
      comentarios:
        'Las cifras de este documento son sintéticas, se utilizan para comprobar gráficos, cálculos y presentación.',
      tema: 'azul',
      agrupacion: 'mes',
      portada: true,
      tablas: true,
      secciones: secciones
        .filter((s) => s.id !== 'evolucion_dia')
        .map((s) => s.id),
    },
  };
}

describe('Alcance y presentación de informes', () => {
  const base = {
    tipo: 'PERIODO',
    desde: '2026-01-01',
    hasta: '2026-12-31',
    solicitud: id,
  };
  it.each([
    { ...base, desde: '' },
    { ...base, hasta: '2025-12-31' },
    { ...base, desde: '2026-02-30' },
    { ...base, tipo: 'ADMIN' },
    { ...base, tipo: 'ESTUDIANTE' },
    { ...base, tipo: 'CASO' },
    { ...base, estudiante: id },
    { ...base, nivel: 'otro' },
    { ...base, solicitud: 'otro' },
    { ...base, tipo: 'ESTUDIANTE', estudiante: id, curso: id },
    { ...base, tipo: 'CASO', caso: id, estudiante: id },
  ])('rechaza un alcance inválido antes de consultar', (d) =>
    expect(() => validarAlcanceInforme(d)).toThrow(),
  );
  it('admite estudiante, caso o período con alcance excluyente', () => {
    expect(
      validarAlcanceInforme({ ...base, tipo: 'ESTUDIANTE', estudiante: id }),
    ).toMatchObject({ estudiante: id, caso: null });
    expect(
      validarAlcanceInforme({ ...base, tipo: 'CASO', caso: id }),
    ).toMatchObject({ caso: id, estudiante: null });
  });
  it('rechaza secciones inventadas, vacías, duplicadas y opciones de estilo libres', () => {
    const p = muestra().presentacion;
    for (const cambio of [
      { secciones: [] },
      { secciones: ['otro'] },
      { secciones: ['resumen', 'resumen'] },
      { tema: 'rojo' },
      { portada: 'true' },
      { titulo: ' ' },
      { comentarios: 'x'.repeat(5001) },
    ])
      expect(() =>
        validarPresentacionInforme(
          { ...p, ...cambio },
          muestra().secciones.map((s) => s.id),
        ),
      ).toThrow();
  });
  it('rellena los ceros y conserva los límites de un año bisiesto', () => {
    expect(
      serieCompleta('2024-02-28', '2024-03-01', 'dia', [
        { fecha: '2024-02-29', total: 2 },
      ]),
    ).toEqual([
      ['2024-02-28', 0],
      ['2024-02-29', 2],
      ['2024-03-01', 0],
    ]);
    expect(serieCompleta('2026-03-15', '2026-06-02', 'mes', [])).toHaveLength(
      4,
    );
  });
  it('personalizar el intervalo visual no cambia la instantánea ni inventa porcentajes', () => {
    const d = muestra();
    expect(d.hallazgos.join(' ')).toContain(
      'Conflicto verbal en 2026-06, de 0 a 5',
    );
    d.presentacion.agrupacion = 'dia';
    const temporal = seccionesDelInforme(d).find(
      (s) => s.id === 'evolucion_mes',
    )!;
    expect(temporal.columnas[0]).toBe('Día');
    expect(d.secciones.find((s) => s.id === 'evolucion_mes')!.columnas[0]).toBe(
      'Mes',
    );
    expect(
      d.indicadores.comparacion.indicadores[0].variacion_porcentual,
    ).toBeNull();
  });
});

describe('Lectura del período (anexo de insights)', () => {
  it('compara el último mes con el anterior, sin inventar porcentajes', () => {
    const d = muestra();
    expect(d.hallazgos).toContain(
      'En 2026-08 se registraron 4 situaciones, frente a 1 en 2026-07 (+300 %) (sección Evolución mensual de situaciones)',
    );
    const sinAnterior = {
      ...d.indicadores,
      por_mes: [{ mes: '2026-08', total: 4 }],
    };
    expect(hallazgosInforme(sinAnterior).join(' ')).toContain(
      'frente a 0 en 2026-07, sin registros el mes anterior la variación no se calcula',
    );
  });
  it('avisa los meses incompletos, la categoría mayor, los vencidos y las muestras chicas', () => {
    const d = muestra().indicadores;
    const frases = hallazgosInforme({ ...d, hasta: '2026-08-20' }).join(' ');
    expect(frases).toContain('uno de esos meses está incompleto en el período');
    expect(frases).toContain(
      'La categoría con más registros fue Conflicto verbal, con 10 situaciones',
    );
    expect(frases).toContain(
      'Hay 1 compromiso vencido y 1 seguimiento vencido dentro del corte',
    );
    expect(frases).toContain('son pocos casos y no indican una tendencia');
    const sinVencidos = hallazgosInforme({
      ...d,
      compromisos: vacio,
      seguimientos: { ...vacio, vencidos: 2 },
    }).join(' ');
    expect(sinVencidos).toContain('Hay 2 seguimientos vencidos dentro del corte');
    expect(sinVencidos).not.toContain('compromiso');
  });
  it('la advertencia queda fuera de la lista y se pueden omitir hallazgos', () => {
    const d = muestra();
    expect(d.hallazgos).not.toContain(AVISO_HALLAZGOS);
    d.presentacion.hallazgos_omitidos = [0, 2];
    expect(hallazgosElegidos(d)).toEqual(
      d.hallazgos.filter((_, i) => i !== 0 && i !== 2),
    );
    // Una edición anterior guardaba la advertencia como último hallazgo.
    d.hallazgos = [...d.hallazgos, AVISO_HALLAZGOS];
    d.presentacion.hallazgos_omitidos = [];
    expect(hallazgosElegidos(d)).not.toContain(AVISO_HALLAZGOS);
  });
  it('valida las posiciones de los hallazgos omitidos', () => {
    const d = muestra();
    const ids = d.secciones.map((s) => s.id);
    for (const omitidos of [[-1], [1.5], ['1'], [0, 0], [d.hallazgos.length], 'x'])
      expect(() =>
        validarPresentacionInforme(
          { ...d.presentacion, hallazgos_omitidos: omitidos },
          ids,
          d.hallazgos.length,
        ),
      ).toThrow();
    expect(
      validarPresentacionInforme(
        { ...d.presentacion, hallazgos_omitidos: [2, 0] },
        ids,
        d.hallazgos.length,
      ).hallazgos_omitidos,
    ).toEqual([0, 2]);
    expect(
      validarPresentacionInforme(d.presentacion, ids, d.hallazgos.length)
        .hallazgos_omitidos,
    ).toEqual([]);
  });
  it('sin hallazgos elegidos el PDF y el XLSX no muestran la lectura del período', async () => {
    const d = muestra();
    d.presentacion.hallazgos_omitidos = d.hallazgos.map((_, i) => i);
    const extraido = await extractText(
      new Uint8Array(await generarPdfInforme(d)),
      { mergePages: true },
    );
    expect(extraido.text).not.toContain('Lectura del período');
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(
      (await generarXlsxInforme(d)) as unknown as ExcelJS.Buffer,
    );
    expect(libro.getWorksheet('Hallazgos')).toBeUndefined();
    d.presentacion.hallazgos_omitidos = [];
    const completo = new ExcelJS.Workbook();
    await completo.xlsx.load(
      (await generarXlsxInforme(d)) as unknown as ExcelJS.Buffer,
    );
    const hoja = completo.getWorksheet('Hallazgos')!;
    expect(hoja.rowCount).toBe(d.hallazgos.length + 2);
    expect(hoja.getCell(`A${hoja.rowCount}`).value).toBe(AVISO_HALLAZGOS);
  }, 20000);
});

describe('Archivos de un mismo corte', () => {
  it('PDF y XLSX conservan las cifras, definiciones, autor y ausencia de denominador', async () => {
    const d = muestra();
    const pdf = await generarPdfInforme(d);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const extraido = await extractText(new Uint8Array(pdf), {
      mergePages: true,
    });
    expect(extraido.text.replace(/\s+/g, ' ')).toContain(d.presentacion.titulo);
    expect(extraido.text).toContain('No calculable');
    expect(extraido.text).toContain('Equipo de Convivencia');
    expect(extraido.text).toContain('15');
    expect(extraido.text).toContain('Denominador');
    expect(extraido.text).toContain('Meses');
    expect(extraido.text).toContain('100 %');
    const xlsx = await generarXlsxInforme(d);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(xlsx as unknown as ExcelJS.Buffer);
    const resumen = libro.getWorksheet('Resumen del período')!;
    expect(resumen.getCell('B2').value).toBe(15);
    expect(resumen.getCell('B5').value).toBe(50);
    expect(
      libro.worksheets
        .find((h) => h.name.startsWith('Comparación'))
        ?.getCell('D2').value,
    ).toBe('No calculable');
    expect(libro.getWorksheet('Definiciones')!.rowCount).toBe(
      DEFINICIONES_INDICADORES.length + 1,
    );
    const variacion=libro.worksheets.find(h=>h.name.startsWith('Comparación'))!.getCell('D3');
    expect(variacion.value).toBe(100);
    expect(variacion.numFmt).toContain('%');
    if (process.env.CONVI_MUESTRA_INFORME) {
      await writeFile(process.env.CONVI_MUESTRA_INFORME + '.pdf', pdf);
      await writeFile(process.env.CONVI_MUESTRA_INFORME + '.xlsx', xlsx);
    }
  }, 20000);
  it('los textos no se convierten en fórmulas de Excel y una selección no filtra datos por su cuenta', async () => {
    const d = muestra();
    d.presentacion.titulo = '=HYPERLINK("https://example.invalid","texto")';
    d.presentacion.secciones = ['resumen'];
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(
      (await generarXlsxInforme(d)) as unknown as ExcelJS.Buffer,
    );
    expect(libro.getWorksheet('Información')!.getCell('B2').type).toBe(
      ExcelJS.ValueType.String,
    );
    expect(libro.worksheets).toHaveLength(4);
    expect(libro.getWorksheet('Resumen del período')!.getCell('B2').value).toBe(
      d.indicadores.total_situaciones,
    );
  });
  it('cero y denominadores ausentes se muestran sin inventar tasas', async () => {
    const d = muestra();
    d.indicadores.total_situaciones = 0;
    d.indicadores.compromisos = vacio;
    d.indicadores.seguimientos = vacio;
    d.indicadores.cierres = {
      total: 0,
      con_plazo: 0,
      sin_plazo: 0,
      oportunos: 0,
      porcentaje_oportunos: null,
    };
    d.indicadores.gestion = { casos_cerrados: 0, dias_promedio: null };
    d.secciones = seccionesIndicadores(d.indicadores);
    d.presentacion.secciones = ['resumen'];
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(
      (await generarXlsxInforme(d)) as unknown as ExcelJS.Buffer,
    );
    expect(libro.getWorksheet('Resumen del período')!.getCell('B5').value).toBe(
      'Sin datos',
    );
    expect(libro.getWorksheet('Resumen del período')!.getCell('B6').value).toBe(
      'Sin datos',
    );
  });
});
