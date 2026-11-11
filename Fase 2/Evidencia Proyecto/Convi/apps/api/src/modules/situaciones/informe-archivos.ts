import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import {
  AVISO_HALLAZGOS,
  hallazgosElegidos,
  seccionesDelInforme,
  type CeldaInforme,
  type InstantaneaInforme,
  type SeccionInforme,
} from './informe.js';

export function valorInforme(valor: CeldaInforme, columna = '') {
  return valor === null
    ? columna.includes('Variación')
      ? 'No calculable'
      : 'Sin datos'
    : typeof valor === 'number'
      ? valor.toLocaleString('es-CL', { maximumFractionDigits: 1 }) +
        (columna.includes('Variación') ? ' %' : '')
      : valor;
}
const fecha = (d: InstantaneaInforme) =>
  new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: d.indicadores.zona_horaria,
  }).format(new Date(d.creado_en));

export async function generarXlsxInforme(
  d: InstantaneaInforme,
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = d.creador;
  libro.created = new Date(d.creado_en);
  libro.modified = new Date(d.creado_en);
  const color = d.presentacion.tema === 'verde' ? 'FF247552' : 'FF1E3A5F';
  const agregar = (
    nombre: string,
    columnas: string[],
    filas: CeldaInforme[][],
  ) => {
    const hoja = libro.addWorksheet(nombre.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 1 }],
      pageSetup: {
        paperSize: 9,
        orientation: columnas.length > 5 ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });
    hoja.addRow(columnas);
    for (const fila of filas)
      hoja.addRow(
        fila.map((v, i) => (v === null ? valorInforme(v, columnas[i]) : v)),
      );
    hoja.columns = columnas.map((_, i) => ({
      width: Math.min(
        65,
        Math.max(
          i === 0 ? 26 : 18,
          ...filas
            .slice(0, 100)
            .map((f) => String(f[i] ?? '').split('\n')[0].length + 2),
        ),
      ),
    }));
    hoja.eachRow((fila, n) => {
      fila.alignment = { vertical: 'top', wrapText: true };
      fila.font = { name: 'Calibri', size: 11, color: { argb: 'FF1F2937' } };
      if (n === 1) {
        fila.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: color },
        };
        fila.font = {
          name: 'Calibri',
          bold: true,
          size: 11,
          color: { argb: 'FFFFFFFF' },
        };
        fila.height = 30;
      } else if (n % 2 === 0)
        fila.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F0EC' },
        };
      fila.eachCell((c) => {
        if (typeof c.value === 'number') {
          c.numFmt = Number.isInteger(c.value) ? '0' : '0.0########';
          if (columnas[Number(c.col) - 1]?.includes('Variación'))
            c.numFmt += '" %"';
        }
      });
    });
    hoja.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, hoja.rowCount), column: columnas.length },
    };
    hoja.headerFooter.oddFooter =
      'CONVI · Uso interno de Convivencia · Página &P de &N';
    return hoja;
  };
  agregar(
    'Información',
    ['Campo', 'Valor'],
    [
      ['Título', d.presentacion.titulo],
      ['Subtítulo', d.presentacion.subtitulo],
      ['Escuela', d.escuela],
      ['Creado por', d.creador],
      ['Fecha de creación', fecha(d)],
      ['Corte del cálculo', new Date(d.indicadores.calculado_en).toISOString()],
      ['Zona horaria', d.indicadores.zona_horaria],
      ['Desde', d.alcance.desde],
      ['Hasta', d.alcance.hasta],
      ...d.filtros_texto.map((t) => ['Alcance', t]),
      ['Comentarios del equipo', d.presentacion.comentarios],
      [
        'Nota',
        'Sin datos indica un valor sin denominador o promedio disponible, No calculable indica un conteo anterior igual a cero',
      ],
    ],
  );
  // Solo los hallazgos que la persona dejó, con la advertencia fija al final.
  const hallazgos = hallazgosElegidos(d);
  if (hallazgos.length)
    agregar(
      'Hallazgos',
      ['Observación'],
      [...hallazgos, AVISO_HALLAZGOS].map((t) => [t]),
    );
  for (const s of seccionesDelInforme(d)) {
    const hoja = agregar(s.titulo, s.columnas, s.filas);
    hoja.addRow([]);
    hoja.addRow(['Criterio', s.descripcion]);
  }
  agregar(
    'Definiciones',
    ['Indicador', 'Criterio de fecha', 'Fórmula', 'Denominador'],
    d.definiciones.map((f) => [f.indicador, f.fecha, f.formula, f.denominador]),
  );
  return Buffer.from(await libro.xlsx.writeBuffer());
}

export function generarPdfInforme(d: InstantaneaInforme): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 76, bottom: 60, left: 48, right: 48 },
    bufferPages: true,
    info: {
      Title: d.presentacion.titulo,
      Author: d.creador,
      Subject: 'Informe de convivencia de ' + d.escuela,
      Creator: 'CONVI',
      CreationDate: new Date(d.creado_en),
    },
  });
  const chunks: Buffer[] = [];
  const resultado = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  try {
    const tinta = d.presentacion.tema === 'verde' ? '#247552' : '#1e3a5f';
    const ancho = doc.page.width - 96;
    const texto = (t: string, tamano = 10, color = '#374151') => {
      doc
        .font('Helvetica')
        .fontSize(tamano)
        .fillColor(color)
        .text(t, 48, doc.y, { width: ancho, lineGap: 4, paragraphGap: 6 });
    };
    const cabecera = () => {
      doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor(tinta)
        .text('convi', 48, 30, { lineBreak: false });
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#536071')
        .text('Informe de convivencia · Uso interno', 140, 34, {
          width: ancho - 92,
          lineBreak: false,
          align: 'right',
        });
      doc
        .moveTo(48, 57)
        .lineTo(doc.page.width - 48, 57)
        .lineWidth(0.6)
        .strokeColor('#d6d3cc')
        .stroke();
      doc.y = 78;
      doc.x = 48;
    };
    doc.on('pageAdded', cabecera);
    const espacio = (alto: number) => {
      if (doc.y + alto > doc.page.height - 65) doc.addPage();
    };
    const titulo = (t: string) => {
      espacio(65);
      doc.moveDown(0.8);
      doc
        .font('Times-Bold')
        .fontSize(22)
        .fillColor(tinta)
        .text(t, 48, doc.y, { width: ancho });
      doc.moveDown(0.45);
    };
    cabecera();
    if (d.presentacion.portada) {
      doc.y = 118;
      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor('#536071')
        .text(d.escuela, { width: ancho });
      doc.moveDown(1.3);
      doc
        .font('Times-Bold')
        .fontSize(35)
        .fillColor(tinta)
        .text(d.presentacion.titulo, { width: ancho, lineGap: 3 });
      if (d.presentacion.subtitulo) {
        doc.moveDown(0.6);
        texto(d.presentacion.subtitulo, 15);
      }
      doc.moveDown(1.1);
      texto('Del ' + d.alcance.desde + ' al ' + d.alcance.hasta, 13, tinta);
      if (d.sujeto) {
        doc.moveDown(0.6);
        texto(d.sujeto, 13);
      }
      doc.moveDown(1.1);
      for (const filtro of d.filtros_texto) texto(filtro, 10);
      doc.moveDown(1.2);
      texto('Preparado por ' + d.creador, 11);
      texto(fecha(d), 10);
      texto('Zona horaria ' + d.indicadores.zona_horaria, 9);
      doc.moveDown(1);
      texto(
        'El informe conserva las cifras y los criterios de su corte de cálculo, contiene información para uso exclusivo del equipo de Convivencia.',
        10,
      );
      doc.addPage();
    } else {
      titulo(d.presentacion.titulo);
      if (d.presentacion.subtitulo) texto(d.presentacion.subtitulo, 12);
      texto(d.escuela + ' · Del ' + d.alcance.desde + ' al ' + d.alcance.hasta);
      texto('Preparado por ' + d.creador + ' · ' + fecha(d), 9);
      for (const filtro of d.filtros_texto) texto(filtro, 9);
    }
    // Refinamientos de Convivencia, anexo de insights: la lectura del período
    // se puede quitar entera dejando sin marcar todos sus hallazgos.
    const lectura = hallazgosElegidos(d);
    if (lectura.length) {
      titulo('Lectura del período');
      texto(
        'Cifras al ' +
          new Intl.DateTimeFormat('es-CL', {
            dateStyle: 'long',
            timeStyle: 'short',
            timeZone: d.indicadores.zona_horaria,
          }).format(new Date(d.indicadores.calculado_en)) +
          ' · ' +
          d.indicadores.zona_horaria,
        9,
      );
      for (const hallazgo of [...lectura, AVISO_HALLAZGOS]) {
        espacio(50);
        texto(hallazgo, 11);
      }
    }
    if (d.presentacion.comentarios) {
      titulo('Comentarios del equipo');
      texto(d.presentacion.comentarios, 11);
    }

    const tabla = (s: SeccionInforme) => {
      const columnas = s.columnas.length;
      const pesos =
        columnas <= 2
          ? [0.7, 0.3]
          : columnas === 3
            ? [0.33, 0.15, 0.52]
            : Array.from({ length: columnas }, () => 1 / columnas);
      const anchos = pesos.map((p) => p * ancho);
      const encabezado = () => {
        espacio(75);
        let x = 48;
        const y = doc.y;
        doc.rect(48, y, ancho, 34).fill(tinta);
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
        s.columnas.forEach((c, i) => {
          doc.text(c, x + 7, y + 8, {
            width: anchos[i] - 14,
            height: 25,
            lineBreak: true,
          });
          x += anchos[i];
        });
        doc.y = y + 34;
      };
      encabezado();
      s.filas.forEach((f, n) => {
        const celdas = f.map((v, i) => valorInforme(v, s.columnas[i]));
        doc.font('Helvetica').fontSize(9);
        const alto = Math.max(
          30,
          ...celdas.map(
            (c, i) =>
              doc.heightOfString(c, { width: anchos[i] - 14, lineGap: 3 }) + 14,
          ),
        );
        if (alto > 540) {
          espacio(70);
          doc.moveDown(0.5);
          for (let i = 0; i < celdas.length; i++)
            texto(s.columnas[i] + ' — ' + celdas[i], 9);
          doc.moveDown(0.5);
          encabezado();
          return;
        }
        if (doc.y + alto > doc.page.height - 65) {
          doc.addPage();
          texto(s.titulo + ' · continuación', 10, tinta);
          encabezado();
        }
        const y = doc.y;
        let x = 48;
        if (n % 2 === 0) doc.rect(48, y, ancho, alto).fill('#f1f0ec');
        doc.font('Helvetica').fontSize(9).fillColor('#1f2937');
        celdas.forEach((c, i) => {
          doc.text(c, x + 7, y + 7, { width: anchos[i] - 14, lineGap: 3 });
          x += anchos[i];
        });
        doc.y = y + alto;
      });
      doc.moveDown(0.8);
    };
    const barras = (s: SeccionInforme) => {
      const maximo = Math.max(1, ...s.filas.map((f) => Number(f[1])));
      for (const fila of s.filas) {
        doc.font('Helvetica').fontSize(9);
        const nombre = String(fila[0]);
        const alto = Math.max(
          36,
          doc.heightOfString(nombre, { width: 164 }) + 12,
        );
        if (doc.y + alto > doc.page.height - 65) {
          doc.addPage();
          texto(s.titulo + ' · continuación', 10, tinta);
          doc.moveDown(0.5);
        }
        const y = doc.y;
        doc.fillColor('#374151').text(nombre, 48, y + 1, { width: 164 });
        doc.roundedRect(222, y + 3, ancho - 220, 10, 3).fill('#eaf0f7');
        const largo = ((ancho - 220) * Number(fila[1])) / maximo;
        if (largo > 0)
          doc
            .roundedRect(222, y + 3, largo, 10, Math.min(3, largo / 2))
            .fill(tinta);
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor(tinta)
          .text(valorInforme(fila[1]), doc.page.width - 80, y, {
            width: 32,
            align: 'right',
            lineBreak: false,
          });
        doc.y = y + alto;
      }
    };
    const columnasMensuales = (s: SeccionInforme) => {
      espacio(265);
      const x = 92,
        y = doc.y + 12,
        w = ancho - 55,
        h = 175;
      const maximo =
        Math.max(
          1,
          Math.ceil(Math.max(...s.filas.map((f) => Number(f[1]))) / 4),
        ) * 4;
      for (let i = 0; i <= 4; i++) {
        const yy = y + h - (h * i) / 4;
        doc
          .moveTo(x, yy)
          .lineTo(x + w, yy)
          .lineWidth(0.4)
          .strokeColor('#d6d3cc')
          .stroke();
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#536071')
          .text(String((maximo * i) / 4), x - 30, yy - 4, {
            width: 22,
            align: 'right',
            lineBreak: false,
          });
      }
      doc
        .save()
        .translate(53, y + h / 2)
        .rotate(-90)
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#374151')
        .text('Situaciones', -45, 0, {
          width: 90,
          align: 'center',
          lineBreak: false,
        })
        .restore();
      const paso = w / s.filas.length;
      const cruzado =
        new Set(s.filas.map((f) => String(f[0]).slice(0, 4))).size > 1;
      for (const [i, f] of s.filas.entries()) {
        const centro = x + (i + 0.5) * paso;
        const alto = (Number(f[1]) / maximo) * h;
        const anchoBarra = Math.min(26, paso * 0.65);
        if (alto > 0)
          doc
            .rect(centro - anchoBarra / 2, y + h - alto, anchoBarra, alto)
            .fill(tinta);
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#374151')
          .text(String(f[1]), centro - paso / 2, y + h - alto - 13, {
            width: paso,
            align: 'center',
            lineBreak: false,
          });
        const mes = new Intl.DateTimeFormat('es-CL', {
          month: 'short',
          timeZone: 'UTC',
        })
          .format(new Date(String(f[0]) + '-01T12:00:00Z'))
          .slice(0, 3);
        doc
          .fontSize(7)
          .text(
            mes + (cruzado ? ' ' + String(f[0]).slice(2, 4) : ''),
            centro - paso / 2,
            y + h + 12,
            { width: paso, align: 'center', lineBreak: false },
          );
      }
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#374151')
        .text('Meses', x, y + h + 32, {
          width: w,
          align: 'center',
          lineBreak: false,
        });
      doc.y = y + h + 60;
      doc.x = 48;
    };
    const lineas = (s: SeccionInforme) => {
      espacio(235);
      const x = 78,
        y = doc.y + 10,
        w = ancho - 45,
        h = 150;
      const maximo =
        Math.max(
          1,
          Math.ceil(Math.max(...s.filas.map((f) => Number(f[1]))) / 4),
        ) * 4;
      for (let i = 0; i <= 4; i++) {
        const yy = y + h - (h * i) / 4;
        doc
          .moveTo(x, yy)
          .lineTo(x + w, yy)
          .lineWidth(0.4)
          .strokeColor('#d6d3cc')
          .stroke();
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#536071')
          .text(
            ((maximo * i) / 4).toLocaleString('es-CL', {
              maximumFractionDigits: 1,
            }),
            48,
            yy - 4,
            { width: 24, align: 'right', lineBreak: false },
          );
      }
      const puntos = s.filas.map((f, i) => [
        x + (i * w) / Math.max(1, s.filas.length - 1),
        y + h - (Number(f[1]) / maximo) * h,
      ]);
      doc.moveTo(puntos[0][0], puntos[0][1]);
      for (const p of puntos.slice(1)) doc.lineTo(p[0], p[1]);
      doc.lineWidth(1.8).strokeColor(tinta).stroke();
      const cada = Math.ceil(s.filas.length / 6);
      s.filas.forEach((f, i) => {
        if (s.filas.length <= 15)
          doc.circle(puntos[i][0], puntos[i][1], 2.5).fill(tinta);
        if (i % cada === 0 || i === s.filas.length - 1) {
          doc
            .font('Helvetica')
            .fontSize(7)
            .fillColor('#536071')
            .text(String(f[0]), puntos[i][0] - 24, y + h + 12, {
              width: 48,
              align: 'center',
              lineBreak: false,
            });
        }
      });
      doc.y = y + h + 42;
    };
    const matriz = (s: SeccionInforme) => {
      const w = (ancho - 160) / (s.columnas.length - 1);
      const maximo = Math.max(
        1,
        ...s.filas.flatMap((f) => f.slice(1).map(Number)),
      );
      const head = () => {
        espacio(40);
        const y = doc.y;
        doc
          .font('Helvetica-Bold')
          .fontSize(7)
          .fillColor(tinta)
          .text('Categoría', 48, y, { width: 155 });
        s.columnas.slice(1).forEach((c, i) =>
          doc.text(c.slice(5) + '/' + c.slice(2, 4), 208 + i * w, y, {
            width: w,
            align: 'center',
            lineBreak: false,
          }),
        );
        doc.y = y + 26;
      };
      head();
      for (const f of s.filas) {
        doc.font('Helvetica').fontSize(8);
        const alto = Math.max(
          30,
          doc.heightOfString(String(f[0]), { width: 148 }) + 10,
        );
        if (doc.y + alto > doc.page.height - 65) {
          doc.addPage();
          head();
        }
        const y = doc.y;
        doc.fillColor('#374151').text(String(f[0]), 48, y + 5, { width: 148 });
        f.slice(1).forEach((v, i) => {
          const intensidad = Number(v) / maximo;
          doc
            .save()
            .fillOpacity(0.08 + intensidad * 0.82)
            .rect(208 + i * w, y, w - 2, alto - 2)
            .fill(tinta)
            .restore();
          doc
            .font('Helvetica-Bold')
            .fontSize(8)
            .fillColor(intensidad > 0.5 ? '#ffffff' : '#1f2937')
            .text(String(v), 208 + i * w, y + 8, {
              width: w - 2,
              align: 'center',
              lineBreak: false,
            });
        });
        doc.y = y + alto;
      }
      doc.moveDown();
    };
    for (const s of seccionesDelInforme(d)) {
      const estimado =
        s.grafico === 'lineas' ||
        (s.grafico === 'barras' &&
          s.id === 'evolucion_mes' &&
          s.columnas[0] === 'Mes')
          ? 350 + (d.presentacion.tablas ? Math.min(s.filas.length, 8) * 30 : 0)
          : s.grafico === 'barras'
            ? 110 +
              Math.min(s.filas.length, 8) * (d.presentacion.tablas ? 70 : 40)
            : s.grafico === 'matriz'
              ? 130 + Math.min(s.filas.length, 8) * 30
              : 180;
      espacio(Math.min(600, estimado));
      titulo(s.titulo);
      texto(s.descripcion, 9);
      doc.moveDown(0.6);
      if (!s.filas.length) {
        texto('Sin datos para este período y alcance');
        continue;
      }
      if (
        s.grafico === 'barras' &&
        s.id === 'evolucion_mes' &&
        s.columnas[0] === 'Mes'
      )
        columnasMensuales(s);
      else if (s.grafico === 'barras') barras(s);
      else if (s.grafico === 'lineas') lineas(s);
      else if (s.grafico === 'matriz') matriz(s);
      if (s.id.endsWith('_detalle')) {
        for (const fila of s.filas) {
          espacio(65);
          doc.moveDown(0.4);
          fila.forEach((v, i) =>
            texto(s.columnas[i] + ' — ' + valorInforme(v, s.columnas[i]), 10),
          );
          doc.moveDown(0.7);
        }
      } else if (
        !s.grafico ||
        (d.presentacion.tablas && s.grafico !== 'matriz')
      )
        tabla(s);
    }
    titulo('Criterios de cálculo');
    for (const c of d.definiciones) {
      espacio(85);
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(tinta)
        .text(c.indicador);
      texto('Fecha — ' + c.fecha, 9);
      texto('Fórmula — ' + c.formula, 9);
      texto('Denominador — ' + c.denominador, 9);
      doc.moveDown(0.5);
    }
    const paginas = doc.bufferedPageRange();
    for (let i = paginas.start; i < paginas.start + paginas.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#536071')
        .text('CONVI · Uso interno de Convivencia', 48, doc.page.height - 34, {
          width: ancho - 70,
          lineBreak: false,
        });
      doc.text(
        i + 1 + ' / ' + paginas.count,
        doc.page.width - 108,
        doc.page.height - 34,
        { width: 60, align: 'right', lineBreak: false },
      );
    }
    doc.end();
  } catch (error) {
    doc.destroy(
      error instanceof Error ? error : new Error('No se pudo preparar el PDF'),
    );
  }
  return resultado;
}
