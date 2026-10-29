import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import type { CuentaService } from '../../database/cuenta.service.js';
import { EvidenciasService } from './evidencias.service.js';

const escuela = '11111111-1111-4111-8111-111111111111';
const sesion: Sesion = {
  authUsuarioId: '22222222-2222-4222-8222-222222222222',
  membresia_id: '33333333-3333-4333-8333-333333333333',
  establecimiento_id: escuela,
  codigo_perfil: 'CONVIVENCIA',
  requiere_segundo_factor: true,
  aal: 'aal2',
};
const evidencia = '44444444-4444-4444-8444-444444444444';
const archivo = {
  nombre: 'prueba.pdf',
  mime: 'application/pdf',
  clave: `${escuela}/evidencias/prueba.pdf`,
  espacio: 'convi-privado',
};

function preparar() {
  const query = vi.fn().mockResolvedValue({ rows: [archivo] });
  const operar = vi.fn(
    async (
      _sesion: Sesion,
      _acceso: unknown,
      trabajo: (db: PoolClient) => Promise<unknown>,
    ) => trabajo({ query } as unknown as PoolClient),
  );
  const download = vi
    .fn()
    .mockResolvedValue({ data: new Blob(['contenido ficticio']), error: null });
  const from = vi.fn().mockReturnValue({ download });
  const servicio = new EvidenciasService(
    { operar } as unknown as CuentaService,
    { storage: { from } } as unknown as SupabaseClient,
  );
  return { query, operar, download, from, servicio };
}

describe('PB-143: descarga privada de evidencias', () => {
  it('PB-114 autoriza estudiante y caso antes de descargar la evidencia asociada', async () => {
    const { servicio, operar, query, download } = preparar();
    await servicio.descargarApoderado(
      { ...sesion, codigo_perfil: 'APODERADO' },
      evidencia,
      escuela,
      evidencia,
    );
    expect(operar).toHaveBeenCalledWith(
      expect.objectContaining({ codigo_perfil: 'APODERADO' }),
      {
        tipo: 'caso',
        id: escuela,
        estudianteId: evidencia,
        perfiles: ['APODERADO'],
      },
      expect.any(Function),
    );
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('ev.id=$1 AND ev.caso_contexto_id=$2'),
      [evidencia, escuela],
    );
    expect(download).toHaveBeenCalledTimes(1);
  });
  it('PB-114 no lee Storage para una evidencia de otro caso o un archivo administrativo', async () => {
    const { servicio, query, from } = preparar();
    query
      .mockResolvedValueOnce({ rows: [{ id: escuela }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      servicio.descargarApoderado(sesion, evidencia, escuela, evidencia),
    ).rejects.toThrow(NotFoundException);
    expect(from).not.toHaveBeenCalled();
  });
  it('PB-114 vuelve a autorizar después de revocar, sin reutilizar el archivo descargado', async () => {
    const { servicio, operar, download } = preparar();
    await servicio.descargarApoderado(sesion, evidencia, escuela, evidencia);
    operar.mockRejectedValueOnce(new ForbiddenException());
    await expect(
      servicio.descargarApoderado(sesion, evidencia, escuela, evidencia),
    ).rejects.toThrow(ForbiddenException);
    expect(download).toHaveBeenCalledTimes(1);
  });
  it('entrega el contenido autorizado sin publicar la ruta de Storage', async () => {
    const { servicio, from, download, operar } = preparar();
    const resultado = await servicio.descargar(
      sesion,
      'CONVIVENCIA',
      evidencia,
    );
    expect(resultado).toEqual({
      nombre: 'prueba.pdf',
      mime: 'application/pdf',
      contenido: Buffer.from('contenido ficticio'),
    });
    expect(operar).toHaveBeenCalledWith(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      expect.any(Function),
    );
    expect(from).toHaveBeenCalledWith('convi-privado');
    expect(download).toHaveBeenCalledWith(archivo.clave);
  });
  it('no consulta Storage si la evidencia no es visible para esa sesión', async () => {
    const { servicio, query, from } = preparar();
    query.mockResolvedValueOnce({ rows: [] });
    await expect(
      servicio.descargar(sesion, 'CONVIVENCIA', evidencia),
    ).rejects.toThrow(NotFoundException);
    expect(from).not.toHaveBeenCalled();
  });
  it('vuelve a autorizar al repetir una descarga después de una revocación', async () => {
    const { servicio, operar, download } = preparar();
    await servicio.descargar(sesion, 'CONVIVENCIA', evidencia);
    operar.mockRejectedValueOnce(new ForbiddenException('Cuenta revocada'));
    await expect(
      servicio.descargar(sesion, 'CONVIVENCIA', evidencia),
    ).rejects.toThrow(ForbiddenException);
    expect(operar).toHaveBeenCalledTimes(2);
    expect(download).toHaveBeenCalledTimes(1);
  });
  it('aplica también la restricción de autor para profesor', async () => {
    const { servicio, query } = preparar();
    await servicio.descargar(
      { ...sesion, codigo_perfil: 'PROFESOR', requiere_segundo_factor: false },
      'PROFESOR',
      evidencia,
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ev.creado_por = convi.membresia_actual()'),
      [evidencia],
    );
  });
  it.each([
    { espacio: 'publico' },
    { clave: `${escuela}/%2e%2e/ajeno.pdf` },
    { clave: `${escuela}/evidencias//prueba.pdf` },
    { clave: `${escuela}/./prueba.pdf` },
    { clave: '55555555-5555-4555-8555-555555555555/evidencias/ajeno.pdf' },
    { clave: `${escuela}/../ajeno.pdf` },
    { clave: `${escuela}/evidencias/../../ajeno.pdf` },
  ])(
    'no usa su credencial privada para un destino fuera de la escuela: %j',
    async (cambio) => {
      const { servicio, query, from } = preparar();
      query.mockResolvedValueOnce({ rows: [{ ...archivo, ...cambio }] });
      await expect(
        servicio.descargar(sesion, 'CONVIVENCIA', evidencia),
      ).rejects.toThrow(NotFoundException);
      expect(from).not.toHaveBeenCalled();
    },
  );
  it('un fallo de Storage no produce una descarga vacía ni un enlace alternativo', async () => {
    const { servicio, download } = preparar();
    download.mockResolvedValueOnce({
      data: null,
      error: { message: 'fallo simulado' },
    });
    await expect(
      servicio.descargar(sesion, 'CONVIVENCIA', evidencia),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
