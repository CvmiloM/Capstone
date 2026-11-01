import type { Contexto, CursoExistente } from './contexto.js';
import type { Revision } from './mapeo.js';
import { revisarFilas } from './revision.js';
import { claveDeCurso } from './valores.js';

// PB-036 (HU-029 CA2): la nómina usa los cursos ya creados (en la guía, con
// códigos automáticos) indicándolos por su código o por su nombre.

describe('claveDeCurso', () => {
  it('compara sin tildes, mayúsculas, «°» ni puntos y con romanos en cifras', () => {
    expect(claveDeCurso('1° Básico A')).toBe('1 basico a');
    expect(claveDeCurso(' 1º basico  a ')).toBe('1 basico a');
    expect(claveDeCurso('I° Medio B')).toBe('1 medio b');
    expect(claveDeCurso('IV medio A')).toBe('4 medio a');
    expect(claveDeCurso('VIII. básico')).toBe('8 basico');
  });

  it('no cambia palabras que empiezan con letras de un romano', () => {
    expect(claveDeCurso('Inicial A')).toBe('inicial a');
    expect(claveDeCurso('Vespertino')).toBe('vespertino');
  });
});

describe('revisarFilas con el curso por nombre', () => {
  const columnas = ['Código', 'Nombres', 'Apellidos', 'Curso'];
  const revision: Revision = {
    mapeo: {
      Código: 'codigo_estudiante',
      Nombres: 'nombres',
      Apellidos: 'apellidos',
      Curso: 'curso',
    },
    anio_academico_id: '00000000-0000-4000-8000-000000000001',
    formato_fecha: 'DD-MM-AAAA',
    duplicados: 'USAR_EXISTENTE',
  };
  const curso = (codigo: string, nombre: string): CursoExistente => ({
    id: `id-${codigo}`,
    codigo,
    nombre,
    estado: 'ACTIVO',
  });
  const cursos = [
    curso('CUR-0001', '1° básico A'),
    curso('CUR-0002', 'Taller'),
    curso('CUR-0003', 'Taller'),
  ];
  const contexto: Contexto = {
    hoy: '2026-11-01',
    anio: {
      id: '00000000-0000-4000-8000-000000000001',
      anio: 2026,
      fecha_inicio: '2026-03-01',
      fecha_fin: '2026-12-20',
    },
    porRut: new Map(),
    porCorreo: new Map(),
    porCorreoDeCuenta: new Map(),
    porCodigoEstudiante: new Map(),
    porNombre: new Map(),
    niveles: new Map(),
    cursos: new Map(cursos.map((c) => [c.codigo, c])),
    cursosPorNombre: new Map([
      ['1 basico a', [cursos[0]]],
      ['taller', [cursos[1], cursos[2]]],
    ]),
    matriculas: new Map(),
    asignaciones: new Map(),
    vinculos: new Map(),
  };
  const revisar = (cursoEscrito: string) =>
    revisarFilas(
      'ESTUDIANTES',
      [
        {
          numero_fila: 2,
          datos_originales: {
            Código: 'E-1',
            Nombres: 'Ana',
            Apellidos: 'Rojas',
            Curso: cursoEscrito,
          },
        },
      ],
      columnas,
      revision,
      contexto,
    )[0];

  it('acepta el código o el nombre y guarda el código', () => {
    for (const escrito of [
      'CUR-0001',
      'cur-0001',
      '1 basico a',
      'I° Básico A',
    ]) {
      const fila = revisar(escrito);
      expect(fila.estado).toBe('VALIDO');
      expect(fila.datos.curso).toBe('CUR-0001');
      expect(fila.datos.fecha_matricula).toBe('2026-03-01');
    }
  });

  it('con dos cursos del mismo nombre pide el código', () => {
    const fila = revisar('Taller');
    expect(fila.estado).toBe('ERROR');
    expect(fila.problemas[0].mensaje).toContain('CUR-0002, CUR-0003');
  });

  it('un curso que no existe sigue con error', () => {
    const fila = revisar('2° básico A');
    expect(fila.estado).toBe('ERROR');
    expect(fila.problemas[0].mensaje).toContain('código o nombre');
  });
});
