import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sesion } from '../../common/sesion.js';
import type { CuentaService } from '../../database/cuenta.service.js';
import { InformesService } from './informes.service.js';
import { generarPdfInforme, generarXlsxInforme } from './informe-archivos.js';
import type { InstantaneaInforme } from './informe.js';

vi.mock('./informe-archivos.js', () => ({
  generarPdfInforme: vi.fn(async () => Buffer.from('PDF conservado')),
  generarXlsxInforme: vi.fn(async () => Buffer.from('XLSX conservado')),
}));
const id = '00000000-0000-4000-8000-000000000001';
const sesion = { membresia_id: id, establecimiento_id: id } as Sesion;
function preparar(estado = 'BORRADOR', autor = id) {
  const instantanea = {
    version: 1,
    presentacion: { titulo: 'Informe' },
    secciones: [],
    archivos: { pdf: id, xlsx: id },
  } as unknown as InstantaneaInforme;
  const informe = {
    id,
    estado,
    creado_por: autor,
    definiciones_calculo: instantanea,
  };
  const pdf = Buffer.from('PDF conservado');
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT id,estado')) return { rows: [informe] };
    if (sql.startsWith('INSERT INTO convi.archivos')) return { rows: [{ id }] };
    if (sql.startsWith('SELECT clave_almacenamiento,sha256'))
      return {
        rows: [
          {
            clave_almacenamiento: 'archivo-privado',
            tamano_bytes: pdf.length,
            sha256: createHash('sha256').update(pdf).digest('hex'),
          },
        ],
      };
    return { rows: [] };
  });
  const operar = vi.fn(
    async (
      _s: unknown,
      _a: unknown,
      trabajo: (db: unknown) => Promise<unknown>,
    ) => trabajo({ query }),
  );
  const upload = vi.fn(async () => ({ error: null as unknown }));
  const remove = vi.fn(async (_claves: string[]) => ({ error: null }));
  const download = vi.fn(async () => ({
    error: null,
    data: new Blob([Uint8Array.from(pdf)]),
  }));
  const storage = {
    storage: { from: vi.fn(() => ({ upload, remove, download })) },
  } as unknown as SupabaseClient;
  const servicio = new InformesService(
    { operar } as unknown as CuentaService,
    storage,
  );
  const revision = createHash('sha256')
    .update(JSON.stringify(instantanea))
    .digest('hex');
  return {
    servicio,
    informe,
    query,
    operar,
    upload,
    remove,
    download,
    revision,
  };
}
beforeEach(() => vi.clearAllMocks());
describe('Conservación y permisos de informes', () => {
  it('un borrador de otra persona no se puede consultar ni descargar', async () => {
    const t = preparar('BORRADOR', 'otra');
    await expect(t.servicio.detalle(sesion, id)).rejects.toThrow(
      'no está disponible',
    );
    expect(t.operar).toHaveBeenCalledWith(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      expect.any(Function),
    );
  });
  it('guardar contenido de una publicación exige una nueva edición', async () => {
    const t = preparar('PUBLICADO');
    await expect(t.servicio.guardar(sesion, id, {})).rejects.toThrow(
      'crea una nueva edición',
    );
    expect(t.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(
      false,
    );
  });
  it('una revisión obsoleta no publica un contenido diferente', async () => {
    const t = preparar();
    await expect(
      t.servicio.publicar(sesion, id, { revision: '0'.repeat(64) }),
    ).rejects.toThrow('cambió desde tu revisión');
    expect(t.upload).not.toHaveBeenCalled();
  });
  it('un reintento de una publicación completada no crea archivos ni recalcula cifras', async () => {
    const t = preparar('PUBLICADO');
    expect(
      await t.servicio.publicar(sesion, id, { revision: t.revision }),
    ).toEqual({ id });
    expect(t.upload).not.toHaveBeenCalled();
    expect(generarPdfInforme).not.toHaveBeenCalled();
  });
  it('un error de carga revierte la publicación y concilia solo los objetos no registrados', async () => {
    const t = preparar();
    t.upload
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error('sin conexión') });
    await expect(
      t.servicio.publicar(sesion, id, { revision: t.revision }),
    ).rejects.toThrow('borrador sigue disponible');
    expect(t.remove).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining('/informes/')]),
    );
    expect(t.remove.mock.calls[0][0]).toHaveLength(2);
  });
  it('una descarga publicada usa el objeto conservado y verifica su integridad', async () => {
    const t = preparar('PUBLICADO');
    expect(
      (await t.servicio.descargar(sesion, id, 'pdf')).contenido.toString(),
    ).toBe('PDF conservado');
    expect(t.download).toHaveBeenCalledWith('archivo-privado');
    expect(generarPdfInforme).not.toHaveBeenCalled();
    t.download.mockResolvedValueOnce({
      error: null,
      data: new Blob(['cambio no esperado']),
    });
    await expect(t.servicio.descargar(sesion, id, 'pdf')).rejects.toThrow(
      'integridad',
    );
  });
  it('sin fechas o sujeto obligatorio no se inicia ninguna consulta de preparación', () => {
    const t = preparar();
    expect(() =>
      t.servicio.preparar(sesion, {
        tipo: 'ESTUDIANTE',
        solicitud: id,
        desde: '2026-01-01',
        hasta: '2026-01-02',
      }),
    ).toThrow();
    expect(t.operar).not.toHaveBeenCalled();
    expect(generarXlsxInforme).not.toHaveBeenCalled();
  });
});
