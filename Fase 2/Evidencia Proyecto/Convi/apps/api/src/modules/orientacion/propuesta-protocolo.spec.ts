import { ErrorIA, type FragmentoEncontrado } from '../normativa/consulta.js';
import { crearOcultador, type ContextoCaso } from './orientacion.js';
import {
  DECLARACION,
  descripcionConFuentes,
  esquemaPropuesta,
  fuentesDe,
  interpretarPropuesta,
  mensajesPropuesta,
  notasPropuesta,
  PropuestaRechazada,
} from './propuesta-protocolo.js';

// PB-124 (HU-105): la propuesta cita el reglamento, no nombra a personas del
// caso y nunca se presenta como protocolo oficial. Lo que depende de la base
// (naturaleza que no cambia, revisor y documento de origen para publicar) lo
// exige el esquema.

const fragmento = (contenido: string, pagina: number): FragmentoEncontrado => ({
  fragmento_id: `f${pagina}`,
  version_id: 'v1',
  documento_id: 'd1',
  titulo: 'Reglamento interno',
  etiqueta_version: '2026',
  pagina_desde: pagina,
  pagina_hasta: pagina,
  contenido,
  distancia: 0.2,
});

const FUENTES = fuentesDe([
  fragmento(
    'Ante una situación de maltrato entre estudiantes, el encargado de convivencia citará al apoderado dentro de 2 días hábiles.',
    12,
  ),
  fragmento(
    'Se registrará por escrito cada entrevista y se informará a la dirección en un plazo de 5 días.',
    13,
  ),
]);

const respuesta = (datos: unknown) => JSON.stringify(datos);

const paso = (extra: Record<string, unknown> = {}) => ({
  nombre: 'Citar al apoderado',
  descripcion:
    'El encargado de convivencia cita al apoderado del estudiante afectado',
  plazo_dias: 2,
  requiere_evidencia: false,
  fuentes: ['F1'],
  ...extra,
});

describe('Lo que recibe la IA (PB-124)', () => {
  it('cada fragmento del reglamento lleva un identificador que se cita', () => {
    expect(FUENTES.map((f) => [f.id, f.etiqueta])).toEqual([
      ['F1', 'Reglamento interno, versión 2026, página 12'],
      ['F2', 'Reglamento interno, versión 2026, página 13'],
    ]);
    const esquema = esquemaPropuesta(FUENTES);
    expect(
      esquema.properties.pasos.items.properties.fuentes.items.enum,
    ).toEqual(['F1', 'F2']);
  });

  it('el caso llega con seudónimos y las instrucciones dicen que no es oficial', () => {
    const { ocultar } = crearOcultador([
      {
        persona_id: 'p1',
        nombres: 'Sofía',
        apellidos: 'Pérez',
        es_estudiante: true,
        rol: 'AFECTADO',
        curso: '1A',
        en_caso: true,
      },
    ]);
    const contexto = {
      caso: {
        id: 'c',
        codigo: 'CASO-2026-00004',
        resumen: 'Sofía Pérez relata burlas en el recreo',
        estado_actual: 'EN_ANALISIS',
        categoria: 'Maltrato entre estudiantes',
        fecha_inicio: '2026-10-05',
        fecha_limite_cierre: null,
      },
    } as ContextoCaso;
    const [sistema, usuario] = mensajesPropuesta(contexto, FUENTES, ocultar);
    expect(sistema.content).toContain('no es un protocolo oficial');
    expect(usuario.content).toContain('Estudiante 1 relata burlas');
    expect(usuario.content).not.toContain('Sofía');
    expect(usuario.content).toContain('[F1] Reglamento interno');
  });
});

describe('Revisión de la propuesta', () => {
  it('ordena los pasos, conserva sus fuentes y el plazo que dice el reglamento', () => {
    const propuesta = interpretarPropuesta(
      respuesta({
        nombre: 'Protocolo ante maltrato entre estudiantes.',
        pasos: [
          paso(),
          paso({
            nombre: '2. Informar a la dirección',
            descripcion: 'Se informa a la dirección por escrito',
            plazo_dias: 5,
            requiere_evidencia: true,
            fuentes: ['F2', 'F2'],
          }),
        ],
      }),
      FUENTES,
    );
    expect(propuesta).toMatchObject({
      nombre: 'Protocolo ante maltrato entre estudiantes',
      descartados: 0,
      pasos: [
        {
          orden_paso: 1,
          nombre: 'Citar al apoderado',
          valor_plazo: 2,
          unidad_plazo: 'DIAS_HABILES',
          fuentes: ['F1'],
        },
        {
          orden_paso: 2,
          nombre: 'Informar a la dirección',
          valor_plazo: 5,
          unidad_plazo: 'DIAS',
          requiere_evidencia: true,
          fuentes: ['F2'],
        },
      ],
    });
    expect(propuesta.fuentes.map((f) => f.id)).toEqual(['F1', 'F2']);
  });

  it('quita el plazo que no aparece en el fragmento citado', () => {
    const { pasos } = interpretarPropuesta(
      respuesta({ nombre: 'Protocolo', pasos: [paso({ plazo_dias: 10 })] }),
      FUENTES,
    );
    expect(pasos[0].valor_plazo).toBeNull();
  });

  it('descarta los pasos sin una fuente entregada', () => {
    const propuesta = interpretarPropuesta(
      respuesta({
        nombre: 'Protocolo',
        pasos: [paso(), paso({ fuentes: ['F9'] }), paso({ fuentes: [] })],
      }),
      FUENTES,
    );
    expect(propuesta.pasos).toHaveLength(1);
    expect(propuesta.descartados).toBe(2);
  });

  it('sin pasos con fuente no hay propuesta', () => {
    expect(() =>
      interpretarPropuesta(
        respuesta({ nombre: 'Protocolo', pasos: [paso({ fuentes: [] })] }),
        FUENTES,
      ),
    ).toThrow(PropuestaRechazada);
  });

  it.each([
    paso({ descripcion: 'Evaluar si el estudiante tiene un trastorno' }),
    paso({ descripcion: 'Conversar con Estudiante 1 sobre lo ocurrido' }),
  ])(
    'no guarda una propuesta que diagnostica o nombra a personas (%#)',
    (malo) => {
      expect(() =>
        interpretarPropuesta(
          respuesta({ nombre: 'Protocolo', pasos: [malo] }),
          FUENTES,
        ),
      ).toThrow(PropuestaRechazada);
    },
  );

  it('una respuesta sin el formato pedido cuenta como falla de la IA', () => {
    for (const malo of [
      'no es json',
      '{}',
      respuesta({ nombre: 'x', pasos: [] }),
    ])
      expect(() => interpretarPropuesta(malo, FUENTES)).toThrow(ErrorIA);
  });
});

describe('Lo que se guarda (HU-105 CA1)', () => {
  it('las notas declaran que no es oficial y listan las fuentes', () => {
    const propuesta = interpretarPropuesta(
      respuesta({ nombre: 'Protocolo', pasos: [paso()] }),
      FUENTES,
    );
    const notas = notasPropuesta(propuesta, 'CASO-2026-00004');
    expect(notas.startsWith(DECLARACION)).toBe(true);
    expect(notas).toContain('pedida desde el caso CASO-2026-00004');
    expect(notas).toContain('F1: Reglamento interno, versión 2026, página 12');
    expect(notas).not.toContain('F2:');
    expect(descripcionConFuentes(propuesta.pasos[0])).toMatch(/\nFuentes: F1$/);
  });
});
