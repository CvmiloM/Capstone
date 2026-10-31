import { BadRequestException } from '@nestjs/common';
import { ErrorIA } from '../normativa/consulta.js';
import type { PersonaCaso } from '../orientacion/orientacion.js';
import {
  CorreoRechazado,
  interpretarCorreo,
  prepararCorreo,
} from './correo-ia.js';
import { validarBorradorCorreo, validarSolicitudCorreoIA } from './correos.js';

const ID = '3f2b8c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function errores(accion: () => unknown) {
  try {
    accion();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (
      (error as BadRequestException).getResponse() as {
        errores: Record<string, string>;
      }
    ).errores;
  }
  throw new Error('No lanzó error');
}

const persona = (
  id: string,
  nombres: string,
  apellidos: string,
  es_estudiante: boolean,
): PersonaCaso => ({
  persona_id: id,
  nombres,
  apellidos,
  es_estudiante,
  rol: null,
  curso: null,
  en_caso: true,
});

describe('PB-151 (HU-130): borrador de correo a mano', () => {
  it('acepta una persona del caso con asunto y contenido', () => {
    expect(
      validarBorradorCorreo({
        persona_destinataria_id: ID.toUpperCase(),
        asunto: ' Citación ',
        contenido: 'Estimada apoderada',
      }),
    ).toEqual({
      persona_destinataria_id: ID,
      direccion: null,
      asunto: 'Citación',
      contenido: 'Estimada apoderada',
    });
  });

  it('acepta solo una dirección escrita', () => {
    expect(
      validarBorradorCorreo({
        direccion: 'familia@correo.cl',
        asunto: 'A',
        contenido: 'B',
      }).direccion,
    ).toBe('familia@correo.cl');
  });

  it('pide destinatario, asunto y contenido', () => {
    expect(Object.keys(errores(() => validarBorradorCorreo({})))).toEqual([
      'persona_destinataria_id',
      'asunto',
      'contenido',
    ]);
  });

  it('rechaza un correo mal escrito y un asunto muy largo', () => {
    const e = errores(() =>
      validarBorradorCorreo({
        direccion: 'no-es-correo',
        asunto: 'x'.repeat(221),
        contenido: 'B',
      }),
    );
    expect(e.direccion).toBeDefined();
    expect(e.asunto).toBeDefined();
  });
});

describe('PB-086 (HU-075): solicitud a la IA', () => {
  it('pide apoderado e indicación', () => {
    expect(Object.keys(errores(() => validarSolicitudCorreoIA({})))).toEqual([
      'persona_destinataria_id',
      'indicacion',
    ]);
  });

  it('limita la indicación a 500 caracteres', () => {
    expect(
      errores(() =>
        validarSolicitudCorreoIA({
          persona_destinataria_id: ID,
          indicacion: 'a'.repeat(501),
        }),
      ).indicacion,
    ).toBeDefined();
  });
});

describe('PB-086 (HU-075): redacción con seudónimos', () => {
  const apoderada = persona('a', 'María', 'Pérez Soto', false);
  const hijo = persona('b', 'Tomás', 'Pérez Rojas', true);
  const otro = persona('c', 'Sofía', 'Muñoz Lagos', true);
  const preparado = prepararCorreo(
    { destinatario: apoderada, estudiantes: [hijo], otras: [otro] },
    'Citar a la mamá de Tomás el jueves a las 10, Sofía Muñoz también estuvo',
  );

  it('la IA no ve nombres reales', () => {
    const usuario = preparado.mensajes[1].content;
    expect(usuario).toContain('Apoderado destinatario: Persona 1');
    expect(usuario).toContain('Estudiante: Estudiante 1');
    expect(usuario).not.toMatch(/Tomás|Sofía|Muñoz|María/);
  });

  it('a las otras personas del caso las recibe sin número', () => {
    const usuario = preparado.mensajes[1].content;
    expect(usuario).toContain('otro estudiante también estuvo');
    expect(usuario).not.toContain('Estudiante 2');
  });

  it('cambia los seudónimos permitidos por los nombres y agrega la firma', () => {
    const correo = interpretarCorreo(
      JSON.stringify({
        asunto: 'Citación por Estudiante 1',
        cuerpo:
          'Estimada Persona 1:\nLe citamos el jueves.\nSaludos cordiales,',
      }),
      preparado.permitidos,
      'Ana Rojas\nEquipo de Convivencia Escolar',
    );
    expect(correo.asunto).toBe('Citación por Tomás Pérez Rojas');
    expect(correo.contenido).toContain('Estimada María Pérez Soto:');
    expect(correo.contenido.endsWith('Equipo de Convivencia Escolar')).toBe(
      true,
    );
  });

  it('rechaza un correo que nombra a otro estudiante del caso', () => {
    expect(() =>
      interpretarCorreo(
        JSON.stringify({
          asunto: 'Citación',
          cuerpo: 'También Estudiante 2 estuvo.',
        }),
        preparado.permitidos,
        'Firma',
      ),
    ).toThrow(CorreoRechazado);
  });

  it('rechaza un correo que diagnostica o predice', () => {
    expect(() =>
      interpretarCorreo(
        JSON.stringify({
          asunto: 'Citación',
          cuerpo:
            'Creemos que Estudiante 1 tiene un trastorno y volverá a hacerlo.',
        }),
        preparado.permitidos,
        'Firma',
      ),
    ).toThrow(CorreoRechazado);
  });

  it('una respuesta sin formato es un fallo de la IA', () => {
    expect(() =>
      interpretarCorreo('hola', preparado.permitidos, 'Firma'),
    ).toThrow(ErrorIA);
    expect(() =>
      interpretarCorreo(
        JSON.stringify({ asunto: '', cuerpo: 'x' }),
        preparado.permitidos,
        'Firma',
      ),
    ).toThrow(ErrorIA);
  });
});
