import { BadRequestException } from '@nestjs/common';
import { validarInvitacion } from './nueva-invitacion.js';

// PB-140 (HU-119 CA1): una petición directa no se salta las reglas de la
// invitación de cuentas (PB-010, HU-009).

function camposConError(cuerpo: unknown): string[] | null {
  try {
    validarInvitacion(cuerpo);
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const respuesta = (error as BadRequestException).getResponse() as {
      errores: Record<string, string>;
    };
    return Object.keys(respuesta.errores).sort();
  }
}

describe('Invitación de cuentas (PB-010, HU-009)', () => {
  const base = {
    nombres: ' Paula ',
    apellidos: ' Rojas ',
    correo: ' Paula.Rojas@Escuela.TEST ',
    perfil: 'PROFESOR',
  };

  it('acepta una invitación y guarda el correo en minúsculas', () => {
    expect(validarInvitacion(base)).toEqual({
      nombres: 'Paula',
      apellidos: 'Rojas',
      correo: 'paula.rojas@escuela.test',
      perfil: 'PROFESOR',
    });
  });

  it('exige nombres, apellidos, correo y perfil (CA1)', () => {
    expect(camposConError({})).toEqual([
      'apellidos',
      'correo',
      'nombres',
      'perfil',
    ]);
  });

  it.each(['ADMIN', 'APODERADO', 'profesor', ''])(
    'no invita con el perfil %j desde esta ruta (CA4)',
    (perfil) => {
      expect(camposConError({ ...base, perfil })).toEqual(['perfil']);
    },
  );

  it.each(['sin-arroba', 'a@b', 'dos@@arrobas.cl', `${'x'.repeat(176)}@a.cl`])(
    'rechaza el correo %j (formato o más de 180 caracteres)',
    (correo) => {
      expect(camposConError({ ...base, correo })).toEqual(['correo']);
    },
  );
});
