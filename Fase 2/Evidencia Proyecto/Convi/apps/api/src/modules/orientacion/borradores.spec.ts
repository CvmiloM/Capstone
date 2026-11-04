import { BadRequestException } from '@nestjs/common';
import { ErrorIA } from '../normativa/consulta.js';
import {
  BorradorRechazado,
  contextoBorrador,
  interpretarBorrador,
  mensajesBorrador,
  validarEdicionBorrador,
  validarRevisionBorrador,
  validarSolicitudBorrador,
  type ActuacionBorrador,
} from './borradores.js';
import { crearOcultador, type ContextoCaso } from './orientacion.js';

// PB-125 y PB-126 (HU-106 y HU-107): las reglas viven en el servidor (HU-119).
// Lo que depende de la base (solicitud completada del mismo autor, Convivencia
// activa, contexto de la edición y texto que no cambia) lo vuelve a exigir el
// esquema en validar_ampliaciones.

const ACTUACION = '5b0c7a8e-1111-4c2a-9d3e-000000000001';
const VERSION = 'a'.repeat(32);

const personas = [
  {
    persona_id: 'p1',
    nombres: 'Sofía',
    apellidos: 'Pérez Rojas',
    es_estudiante: true,
    rol: 'AFECTADO',
    curso: '1A',
    en_caso: true,
  },
  {
    persona_id: 'p2',
    nombres: 'Martín',
    apellidos: 'Soto',
    es_estudiante: false,
    rol: 'APODERADO',
    curso: null,
    en_caso: true,
  },
];

const CASO: ContextoCaso = {
  caso: {
    id: 'caso',
    codigo: 'CASO-2026-0004',
    resumen: 'Sofía Pérez relata burlas reiteradas en el recreo.',
    estado_actual: 'EN_INTERVENCION',
    categoria: 'Agresión verbal',
    fecha_inicio: '2026-10-05',
    fecha_limite_cierre: '2026-11-20',
  },
  situaciones: [
    {
      id: 's1',
      codigo: 'SIT-2026-0011',
      fecha: '2026-10-03',
      lugar: 'Patio',
      categoria: 'Agresión verbal',
      descripcion: 'Sofía Pérez indica que un grupo se burló de ella.',
    },
  ],
  pasos: [
    {
      protocolo: 'Protocolo de maltrato',
      orden: 1,
      nombre: 'Entrevista con la familia',
      estado: 'COMPLETADO',
      vence: '2026-10-10',
    },
  ],
  compromisos: [
    {
      descripcion: 'Martín Soto acompaña la tarea',
      estado: 'PENDIENTE',
      vence: '2026-11-08',
    },
  ],
  actuaciones: [
    {
      tipo: 'ENTREVISTA',
      estado: 'REALIZADA',
      fecha: '2026-10-09',
      objetivo: 'Conocer el relato',
      resultado: 'Se acuerda seguimiento semanal',
    },
  ],
  movimientos: [],
  protocolos: [],
};

const ENTREVISTA: ActuacionBorrador = {
  tipo: 'ENTREVISTA',
  estado: 'REALIZADA',
  inicio: '2026-10-09 10:00',
  termino: '2026-10-09 10:45',
  lugar: 'Oficina de convivencia',
  objetivo: 'Conocer el relato de Sofía',
  descripcion: null,
  resultado: 'Se acuerda seguimiento semanal',
  proxima_accion: null,
  asistentes: [
    { persona_id: 'p2', rol: 'APODERADO', asistencia: 'ASISTIO' },
    { persona_id: 'pX', rol: 'DOCENTE', asistencia: null },
  ],
};

function preparar(tipo: 'ACTA' | 'INFORME') {
  const { seudonimos, ocultar } = crearOcultador(personas);
  const alias = new Map(
    personas.map((p, i) => [p.persona_id, seudonimos[i].alias]),
  );
  const contexto = contextoBorrador(
    tipo,
    {
      caso: CASO,
      actuacion: tipo === 'ACTA' ? ENTREVISTA : null,
      cifras:
        tipo === 'INFORME'
          ? {
              dias_desde_inicio: 30,
              situaciones: 1,
              actuaciones: { REALIZADA: 1 },
              compromisos: { PENDIENTE: 1 },
              pasos_protocolo: { COMPLETADO: 1 },
            }
          : null,
      alias,
    },
    ocultar,
  );
  return { contexto, seudonimos };
}

const respuesta = (titulo: string, ...apartados: [string, string][]) =>
  JSON.stringify({
    titulo,
    apartados: apartados.map(([t, x]) => ({ titulo: t, texto: x })),
  });

describe('Pedir un borrador (PB-125 y PB-126)', () => {
  it('acepta acta del caso, acta de una actuación e informe del caso', () => {
    expect(validarSolicitudBorrador({ tipo: 'ACTA' })).toEqual({
      tipo: 'ACTA',
      actuacion_id: null,
    });
    expect(
      validarSolicitudBorrador({ tipo: 'ACTA', actuacion_id: ACTUACION }),
    ).toEqual({
      tipo: 'ACTA',
      actuacion_id: ACTUACION,
    });
    expect(
      validarSolicitudBorrador({ tipo: 'INFORME', actuacion_id: '' }),
    ).toEqual({
      tipo: 'INFORME',
      actuacion_id: null,
    });
  });

  it('rechaza otros tipos, actuaciones inválidas e informes de una actuación', () => {
    for (const cuerpo of [
      {},
      { tipo: 'ACTA_FIRMADA' },
      { tipo: 'ACTA', actuacion_id: 'x' },
      { tipo: 'INFORME', actuacion_id: ACTUACION },
    ])
      expect(() => validarSolicitudBorrador(cuerpo)).toThrow(
        BadRequestException,
      );
  });

  it('una edición exige título, contenido y la huella de lo que se veía', () => {
    expect(
      validarEdicionBorrador({
        titulo: '  Acta   de entrevista ',
        contenido: 'Antecedentes\r\nTexto',
        version: VERSION,
      }),
    ).toEqual({
      titulo: 'Acta de entrevista',
      contenido: 'Antecedentes\nTexto',
      version: VERSION,
    });
    for (const cuerpo of [
      { titulo: '', contenido: 'x', version: VERSION },
      { titulo: 'x', contenido: '   ', version: VERSION },
      { titulo: 'x', contenido: 'x', version: 'vieja' },
      { titulo: 'x'.repeat(221), contenido: 'x', version: VERSION },
    ])
      expect(() => validarEdicionBorrador(cuerpo)).toThrow(BadRequestException);
  });

  it('la revisión solo marca Revisado o Descartado', () => {
    expect(
      validarRevisionBorrador({ estado_nuevo: 'REVISADO', version: VERSION }),
    ).toEqual({
      estado_nuevo: 'REVISADO',
      version: VERSION,
    });
    for (const estado of ['BORRADOR', 'FIRMADO', undefined])
      expect(() =>
        validarRevisionBorrador({ estado_nuevo: estado, version: VERSION }),
      ).toThrow(BadRequestException);
  });
});

describe('Lo que recibe la IA', () => {
  it('no recibe nombres ni identificadores, solo seudónimos', () => {
    for (const tipo of ['ACTA', 'INFORME'] as const) {
      const enviado = JSON.stringify(preparar(tipo).contexto);
      expect(enviado).not.toMatch(/Sofía|Pérez|Martín|Soto/);
      expect(enviado).not.toMatch(/"id"|"s1"|"p1"|"p2"/);
      expect(enviado).toContain('Estudiante 1');
    }
  });

  it('el acta lleva la actuación y sus asistentes, y quien no está en el caso va sin seudónimo', () => {
    const { contexto } = preparar('ACTA');
    expect(contexto.actuacion_del_acta).toMatchObject({
      tipo: 'entrevista',
      inicio: { fecha: '2026-10-09', hora: '10:00' },
      asistentes: [
        { persona: 'Persona 1', rol: 'apoderado', asistencia: 'asistió' },
        {
          persona: 'otra persona',
          rol: 'docente',
          asistencia: 'sin registrar',
        },
      ],
    });
    expect(contexto).not.toHaveProperty('cifras_calculadas_por_el_servidor');
  });

  it('el informe lleva las cifras calculadas por el servidor (HU-107 CA1)', () => {
    const { contexto } = preparar('INFORME');
    expect(contexto.cifras_calculadas_por_el_servidor).toEqual({
      dias_desde_el_inicio: 30,
      situaciones_vinculadas: 1,
      actuaciones_por_estado: { realizada: 1 },
      compromisos_por_estado: { pendiente: 1 },
      pasos_del_protocolo_por_estado: { completado: 1 },
    });
    expect(contexto).not.toHaveProperty('actuacion_del_acta');
  });

  it('las instrucciones dicen que es un borrador sin firmar y repiten los límites', () => {
    const [sistema] = mensajesBorrador('ACTA', {});
    expect(sistema.content).toContain('borrador sin firmar');
    expect(sistema.content).toContain('Nunca clasifiques');
  });
});

describe('Revisión de lo que redactó la IA', () => {
  it('arma el documento por apartados y pone los nombres reales', () => {
    const { contexto, seudonimos } = preparar('ACTA');
    expect(
      interpretarBorrador(
        respuesta(
          'Acta de entrevista con Persona 1',
          [
            '1. Antecedentes',
            'El 2026-10-09 a las 10:00 se entrevistó a Persona 1 por el relato de Estudiante 1.',
          ],
          ['Firmas', '[Firma de Persona 1]'],
        ),
        contexto,
        seudonimos,
      ),
    ).toEqual({
      titulo: 'Acta de entrevista con Martín Soto',
      contenido:
        'Antecedentes\nEl 2026-10-09 a las 10:00 se entrevistó a Martín Soto por el relato de Sofía Pérez Rojas.\n\nFirmas\n[Firma de Martín Soto]',
    });
  });

  it('no guarda un borrador que nombra a alguien fuera del caso', () => {
    const { contexto, seudonimos } = preparar('ACTA');
    expect(() =>
      interpretarBorrador(
        respuesta('Acta', ['Asistentes', 'Estudiante 7']),
        contexto,
        seudonimos,
      ),
    ).toThrow(BorradorRechazado);
  });

  it('no guarda una cifra o fecha que no está en el caso', () => {
    const { contexto, seudonimos } = preparar('INFORME');
    expect(() =>
      interpretarBorrador(
        respuesta('Informe', ['Actuaciones', 'Se realizaron 7 entrevistas']),
        contexto,
        seudonimos,
      ),
    ).toThrow(BorradorRechazado);
    expect(
      interpretarBorrador(
        respuesta('Informe', [
          'Actuaciones',
          'En 30 días se realizó 1 entrevista',
        ]),
        contexto,
        seudonimos,
      ).contenido,
    ).toBe('Actuaciones\nEn 30 días se realizó 1 entrevista');
  });

  it.each([
    'Estudiante 1 es conflictiva',
    'Estudiante 1 probablemente vuelva a molestar',
    'Se sugiere evaluar un trastorno',
  ])('no guarda "%s" (HU-104 CA2)', (frase) => {
    const { contexto, seudonimos } = preparar('ACTA');
    expect(() =>
      interpretarBorrador(
        respuesta('Acta', ['Desarrollo', frase]),
        contexto,
        seudonimos,
      ),
    ).toThrow(BorradorRechazado);
  });

  it('una respuesta sin el formato pedido cuenta como falla de la IA', () => {
    const { contexto, seudonimos } = preparar('ACTA');
    for (const malo of [
      'no es json',
      '{}',
      respuesta('', ['A', 'b']),
      respuesta('Acta'),
    ])
      expect(() => interpretarBorrador(malo, contexto, seudonimos)).toThrow(
        ErrorIA,
      );
  });
});
