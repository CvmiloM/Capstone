import ExcelJS from 'exceljs';
import { fechaLegible } from '../academico/estudiante.js';
import { CAMPOS, USO_DEL_ANIO } from './campos.js';
import { LIMITES, type TipoImportacion } from './importacion.js';

// PB-020 (decisión del PO): plantilla XLSX de cada tipo de importación, hecha
// con la misma lista de campos que se usa para revisar las filas. La hoja
// Datos va primero porque CONVI lee solo la primera hoja; sus títulos se
// reconocen solos al cargar el archivo.

export function nombreDePlantilla(tipo: TipoImportacion) {
  return `plantilla-${tipo.toLowerCase()}.xlsx`;
}

export async function crearPlantilla(tipo: TipoImportacion) {
  const campos = CAMPOS[tipo];
  const libro = new ExcelJS.Workbook();
  libro.creator = 'CONVI';

  const datos = libro.addWorksheet('Datos', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  datos.columns = campos.map((campo) => ({
    header: campo.titulo,
    key: campo.clave,
    width: Math.max(16, campo.titulo.length + 6),
    // Fechas como día-mes-año; lo demás como texto, para que Excel no quite
    // los ceros a la izquierda ni convierta códigos en números.
    style: { numFmt: campo.fecha ? 'dd-mm-yyyy' : '@' },
  }));
  datos.getRow(1).font = { bold: true };
  campos.forEach((campo, i) => {
    datos.getCell(1, i + 1).note =
      `${campo.obligatorio ? 'Obligatorio' : 'Opcional'}. ${campo.descripcion}`;
  });
  const ejemplo = datos.addRow(
    Object.fromEntries(
      campos.map((campo) => [
        campo.clave,
        campo.fecha && campo.ejemplo
          ? new Date(`${campo.ejemplo}T00:00:00Z`)
          : campo.ejemplo || null,
      ]),
    ),
  );
  ejemplo.font = { italic: true };

  const ayuda = libro.addWorksheet('Instrucciones');
  ayuda.columns = [
    { header: 'Columna', key: 'titulo', width: 24 },
    { header: 'Obligatoria', key: 'obligatorio', width: 12 },
    { header: 'Cómo escribirla', key: 'descripcion', width: 80 },
    { header: 'Ejemplo', key: 'ejemplo', width: 28 },
  ];
  ayuda.getRow(1).font = { bold: true };
  for (const campo of campos)
    ayuda.addRow({
      titulo: campo.titulo,
      obligatorio: campo.obligatorio ? 'Sí' : 'No',
      descripcion: campo.descripcion,
      ejemplo:
        campo.fecha && campo.ejemplo
          ? fechaLegible(campo.ejemplo)
          : campo.ejemplo,
    });
  ayuda.getColumn('descripcion').alignment = {
    wrapText: true,
    vertical: 'top',
  };
  ayuda.addRow([]);
  for (const linea of indicaciones(tipo)) ayuda.addRow([linea]);

  return Buffer.from(await libro.xlsx.writeBuffer());
}

function indicaciones(tipo: TipoImportacion) {
  const lineas = [
    'Completa la hoja Datos desde la fila 2, una fila por registro, y borra la fila de ejemplo.',
    'CONVI lee solo la primera hoja. Puedes cambiar el orden de las columnas o quitar las opcionales: al cargar el archivo eliges qué campo trae cada columna.',
    'Las fechas van como día-mes-año, por ejemplo 15-04-2016.',
    `Guarda el archivo como XLSX o CSV, de hasta ${LIMITES.bytes / (1024 * 1024)} MB y ${LIMITES.filas.toLocaleString('es-CL')} filas.`,
  ];
  if (USO_DEL_ANIO[tipo] === 'SIEMPRE')
    lineas.push(
      'Los cursos se buscan en el año académico que elijas al revisar el archivo.',
    );
  if (USO_DEL_ANIO[tipo] === 'CON_CURSO')
    lineas.push(
      'Si llenas la columna Curso, al confirmar también se matricula al estudiante en el año académico que elijas al revisar el archivo.',
    );
  return lineas;
}