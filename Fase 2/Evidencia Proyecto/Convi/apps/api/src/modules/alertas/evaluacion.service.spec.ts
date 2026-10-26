import type { ColaReglas } from './cola.js';
import { EvaluacionReglas } from './evaluacion.service.js';
import type { MotorReglasService } from './motor.service.js';

// PB-090 (HU-079 CA8): encolar la evaluación nunca afecta a la situación ya
// guardada, y si no hay cola la evaluación se reintenta dentro de la API.

const ESCUELA = '11111111-1111-4111-8111-111111111111';
const SITUACION = '22222222-2222-4222-8222-222222222222';

function motorQue(...respuestas: ('ok' | 'falla')[]) {
  const evaluarSituacion = vi.fn(() => {
    const respuesta = respuestas.shift() ?? 'ok';
    return respuesta === 'ok'
      ? Promise.resolve(null)
      : Promise.reject(new Error('la base no respondió'));
  });
  return {
    evaluarSituacion,
    motor: { evaluarSituacion } as unknown as MotorReglasService,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('EvaluacionReglas', () => {
  it('encola la situación con su id, una sola vez por situación', async () => {
    const add = vi.fn().mockResolvedValue({});
    const { motor, evaluarSituacion } = motorQue();
    const evaluacion = new EvaluacionReglas(
      { add } as unknown as ColaReglas,
      motor,
    );
    evaluacion.despuesDeGuardar(ESCUELA, SITUACION);
    await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add).toHaveBeenCalledWith(
      'evaluar',
      { establecimiento_id: ESCUELA, situacion_id: SITUACION },
      { jobId: `situacion-${SITUACION}` },
    );
    expect(evaluarSituacion).not.toHaveBeenCalled();
  });

  it('si Redis no responde, evalúa dentro de la API sin lanzar el error', async () => {
    const add = vi.fn().mockRejectedValue(new Error('sin Redis'));
    const { motor, evaluarSituacion } = motorQue('ok');
    const evaluacion = new EvaluacionReglas(
      { add } as unknown as ColaReglas,
      motor,
    );
    expect(() => evaluacion.despuesDeGuardar(ESCUELA, SITUACION)).not.toThrow();
    await vi.waitFor(() =>
      expect(evaluarSituacion).toHaveBeenCalledWith(ESCUELA, SITUACION),
    );
  });

  it('sin cola, reintenta con esperas crecientes hasta que la evaluación resulta', async () => {
    vi.useFakeTimers();
    const { motor, evaluarSituacion } = motorQue('falla', 'falla', 'ok');
    new EvaluacionReglas(null, motor).despuesDeGuardar(ESCUELA, SITUACION);
    await vi.advanceTimersByTimeAsync(0);
    expect(evaluarSituacion).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(evaluarSituacion).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30000);
    expect(evaluarSituacion).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(300000);
    expect(evaluarSituacion).toHaveBeenCalledTimes(3);
  });

  it('sin cola, se rinde después de cuatro intentos fallidos', async () => {
    vi.useFakeTimers();
    const { motor, evaluarSituacion } = motorQue(
      'falla',
      'falla',
      'falla',
      'falla',
      'falla',
    );
    new EvaluacionReglas(null, motor).despuesDeGuardar(ESCUELA, SITUACION);
    await vi.advanceTimersByTimeAsync(600000);
    expect(evaluarSituacion).toHaveBeenCalledTimes(4);
  });
});
