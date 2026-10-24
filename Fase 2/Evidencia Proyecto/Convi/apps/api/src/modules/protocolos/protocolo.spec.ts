import { BadRequestException } from '@nestjs/common';
import { validarAplicacion } from '../situaciones/protocolo-caso.js';
import {
  validarPaso,
  validarProtocolo,
  validarPublicacion,
  validarVersion,
} from './protocolo.js';

// PB-081, PB-083 y PB-082: las reglas viven en el servidor (HU-119). Estas
// pruebas envían datos que la pantalla nunca mandaría.

/** Campos con error que devuelve la validación, o null si acepta los datos. */
function camposConError(validar: () => unknown): string[] | null {
  try {
    validar();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const respuesta = (error as BadRequestException).getResponse() as {
      errores: Record<string, string>;
    };
    return Object.keys(respuesta.errores).sort();
  }
}

const DOCUMENTO = '77777777-7777-4777-8777-777777777777';

describe('Protocolos (PB-081, HU-070)', () => {
  it('exige código y nombre, y deja el código en mayúsculas', () => {
    expect(camposConError(() => validarProtocolo({}))).toEqual([
      'codigo',
      'nombre',
    ]);
    expect(
      validarProtocolo({ codigo: ' p-acoso ', nombre: ' Acoso escolar ' }),
    ).toEqual({ codigo: 'P-ACOSO', nombre: 'Acoso escolar' });
    expect(
      camposConError(() =>
        validarProtocolo({ codigo: 'con espacios', nombre: 'x' }),
      ),
    ).toEqual(['codigo']);
  });

  it('acepta una versión sin documento todavía y valida el que se indique (CA1)', () => {
    expect(validarVersion({ notas: '  ' })).toEqual({
      version_documento_origen_id: null,
      notas: null,
    });
    expect(
      validarVersion({
        version_documento_origen_id: DOCUMENTO,
        notas: 'RICE 2026',
      }),
    ).toEqual({ version_documento_origen_id: DOCUMENTO, notas: 'RICE 2026' });
    expect(
      camposConError(() =>
        validarVersion({ version_documento_origen_id: 'RICE' }),
      ),
    ).toEqual(['version_documento_origen_id']);
  });

  it('exige orden y nombre de cada paso (CA2)', () => {
    expect(camposConError(() => validarPaso({}))).toEqual([
      'nombre',
      'orden_paso',
    ]);
    expect(
      camposConError(() => validarPaso({ orden_paso: '0', nombre: 'Paso' })),
    ).toEqual(['orden_paso']);
  });

  it('guarda el plazo con su unidad, la evidencia y si es obligatorio (CA2)', () => {
    expect(
      validarPaso({
        orden_paso: '2',
        nombre: ' Citar al apoderado ',
        descripcion: 'Lo cita el profesor jefe.',
        valor_plazo: '3',
        unidad_plazo: 'DIAS_HABILES',
        requiere_evidencia: 'on',
        es_obligatorio: 'on',
      }),
    ).toEqual({
      orden_paso: 2,
      nombre: 'Citar al apoderado',
      descripcion: 'Lo cita el profesor jefe.',
      valor_plazo: 3,
      unidad_plazo: 'DIAS_HABILES',
      requiere_evidencia: true,
      es_obligatorio: true,
    });
    expect(validarPaso({ orden_paso: 1, nombre: 'Sin plazo' })).toMatchObject({
      valor_plazo: null,
      unidad_plazo: null,
      requiere_evidencia: false,
      es_obligatorio: false,
    });
  });

  it('no acepta un plazo sin unidad, una unidad sin plazo ni plazos negativos', () => {
    expect(
      camposConError(() =>
        validarPaso({ orden_paso: 1, nombre: 'P', valor_plazo: '2' }),
      ),
    ).toEqual(['unidad_plazo']);
    expect(
      camposConError(() =>
        validarPaso({ orden_paso: 1, nombre: 'P', unidad_plazo: 'DIAS' }),
      ),
    ).toEqual(['valor_plazo']);
    expect(
      camposConError(() =>
        validarPaso({
          orden_paso: 1,
          nombre: 'P',
          valor_plazo: '-1',
          unidad_plazo: 'DIAS',
        }),
      ),
    ).toEqual(['valor_plazo']);
  });
});

describe('Publicación de protocolos (PB-083, HU-072)', () => {
  it('exige una fecha de vigencia real (CA1)', () => {
    expect(validarPublicacion({ vigente_desde: '2026-10-24' })).toEqual({
      vigente_desde: '2026-10-24',
    });
    expect(
      camposConError(() => validarPublicacion({ vigente_desde: '2026-02-30' })),
    ).toEqual(['vigente_desde']);
  });
});

describe('Protocolo aplicado al caso (PB-082, HU-071)', () => {
  it('exige la versión y el fundamento (CA1)', () => {
    expect(camposConError(() => validarAplicacion({}))).toEqual([
      'fundamento',
      'version_protocolo_id',
    ]);
    expect(
      validarAplicacion({
        version_protocolo_id: DOCUMENTO.toUpperCase(),
        fundamento: ' Hubo agresiones reiteradas. ',
      }),
    ).toEqual({
      version_protocolo_id: DOCUMENTO,
      fundamento: 'Hubo agresiones reiteradas.',
    });
  });
});
