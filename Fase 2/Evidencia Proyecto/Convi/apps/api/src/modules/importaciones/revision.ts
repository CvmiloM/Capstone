import { BadRequestException } from '@nestjs/common';
import { LARGO_MAXIMO, type Rol } from '../academico/curso.js';
import {
  fechaLegible,
  LARGO_MAXIMO_ESTUDIANTE,
  normalizarRut,
  validarEstudiante,
} from '../academico/estudiante.js';
import { CAMPOS } from './campos.js';
import type { Contexto, CursoExistente, PersonaExistente } from './contexto.js';
import type { Correccion } from './correccion.js';
import type { TipoImportacion } from './importacion.js';
import { type Revision, valoresDeFila } from './mapeo.js';
import {
  claveDeCurso,
  claveDeNombre,
  leerFecha,
  leerRol,
  leerSiNo,
  seCruzan,
} from './valores.js';

// PB-020 (HU-015 CA4): revisa cada fila con el mapeo y las opciones elegidas y
// la deja Válida, Con advertencia o Con error, con cada problema junto a su
// campo. Repite las reglas de las pantallas (PB-015, PB-017 y PB-018) para que
// la vista previa avise lo mismo que rechazaría guardar; la confirmación
// (PB-026) vuelve a comprobarlo antes de crear algo. CA5: no guarda nada en
// las fichas.

export type Problema = {
  /** Clave del campo; null si es de la fila completa. */
  campo: string | null;
  nivel: 'ERROR' | 'ADVERTENCIA';
  mensaje: string;
};

export type FilaRevisada = {
  numero: number;
  estado: 'VALIDO' | 'ADVERTENCIA' | 'ERROR';
  /** Los valores ya normalizados, por campo. */
  datos: Record<string, string | boolean | null>;
  problemas: Problema[];
  /** PB-024: la corrección de la fila, que se conserva al volver a revisar. */
  correccion?: Correccion;
};

// Mismos criterios que la ficha del estudiante (estudiante.ts) y que
// convi.correo_valido.
const CODIGO = /^[A-Z0-9_-]+$/;
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TELEFONO = /^\+?[0-9 ()-]+$/;

const NOMBRE_PERFIL: Record<string, string> = {
  ADMIN: 'Administración',
  CONVIVENCIA: 'Convivencia',
  PROFESOR: 'Profesor',
  APODERADO: 'Apoderado',
};
const NOMBRE_ROL: Record<Rol, string> = {
  PROFESOR_JEFE: 'Profesor jefe',
  PROFESOR: 'Profesor',
};

/** Lo que ya apareció en filas anteriores del mismo archivo. */
type Archivo = {
  vistos: Map<string, number>;
  asignaciones: Map<
    string,
    {
      cuenta_id: string;
      rol: Rol;
      desde: string;
      hasta: string | null;
      fila: number;
    }[]
  >;
};

class Fila {
  readonly problemas: Problema[] = [];
  datos: FilaRevisada['datos'] = {};

  constructor(
    readonly numero: number,
    readonly valores: Record<string, string>,
    readonly revision: Revision,
    readonly contexto: Contexto,
    readonly archivo: Archivo,
  ) {}

  valor(campo: string) {
    return this.valores[campo] ?? '';
  }

  // Un mensaje por campo y nivel: el primero que se encontró.
  private agregar(
    nivel: Problema['nivel'],
    campo: string | null,
    mensaje: string,
  ) {
    if (!this.problemas.some((p) => p.campo === campo && p.nivel === nivel))
      this.problemas.push({ campo, nivel, mensaje });
  }

  error(campo: string | null, mensaje: string) {
    this.agregar('ERROR', campo, mensaje);
  }

  advertir(campo: string | null, mensaje: string) {
    this.agregar('ADVERTENCIA', campo, mensaje);
  }

  tieneError(campo: string) {
    return this.problemas.some((p) => p.campo === campo && p.nivel === 'ERROR');
  }

  /** CA3: lo que ya existe en CONVI se usa sin cambios o es un error, según lo elegido. */
  duplicado(campo: string, mensaje: string) {
    if (this.revision.duplicados === 'ERROR') this.error(campo, mensaje);
    else
      this.advertir(
        campo,
        `${mensaje} Se usará el registro que ya existe, sin cambiar sus datos.`,
      );
  }

  /** El mismo dato en dos filas del archivo: la segunda queda con error. */
  unica(clave: string, campo: string, descripcion: string) {
    const anterior = this.archivo.vistos.get(clave);
    if (anterior === undefined) this.archivo.vistos.set(clave, this.numero);
    else this.error(campo, `${descripcion} ya aparece en la fila ${anterior}.`);
  }

  /** Fecha AAAA-MM-DD; null si viene vacía o no se entiende (con error). */
  fecha(campo: string) {
    const valor = this.valor(campo);
    if (!valor) return null;
    const fecha = leerFecha(valor, this.revision.formato_fecha);
    if (!fecha)
      this.error(
        campo,
        this.revision.formato_fecha === 'DD-MM-AAAA'
          ? `No entendemos la fecha "${valor}". Escríbela como día-mes-año, por ejemplo 15-04-2016.`
          : `No entendemos la fecha "${valor}". Escríbela como mes-día-año, por ejemplo 04-15-2016.`,
      );
    return fecha;
  }

  /** Revisa con las reglas de una pantalla y pasa sus errores a la fila. */
  reglas<T>(validar: () => T): T | null {
    try {
      return validar();
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      const { errores } = error.getResponse() as {
        errores?: Record<string, string>;
      };
      for (const [campo, mensaje] of Object.entries(errores ?? {}))
        this.error(campo, mensaje);
      return null;
    }
  }

  texto(campo: string, largo: number) {
    const valor = this.valor(campo);
    if (valor.length > largo)
      this.error(campo, `Usa como máximo ${largo} caracteres.`);
    return valor || null;
  }

  resultado(): FilaRevisada {
    const estado = this.problemas.some((p) => p.nivel === 'ERROR')
      ? 'ERROR'
      : this.problemas.length > 0
        ? 'ADVERTENCIA'
        : 'VALIDO';
    return {
      numero: this.numero,
      estado,
      datos: this.datos,
      problemas: this.problemas,
    };
  }
}

export function revisarFilas(
  tipo: TipoImportacion,
  filas: {
    numero_fila: number;
    datos_originales: Record<string, string>;
    correccion?: Correccion | null;
  }[],
  columnas: string[],
  revision: Revision,
  contexto: Contexto,
): FilaRevisada[] {
  const archivo: Archivo = { vistos: new Map(), asignaciones: new Map() };
  const campos = CAMPOS[tipo];
  const relacionados = new Set(Object.values(revision.mapeo));
  const conEjemplo = campos.filter(
    (c) => c.ejemplo && relacionados.has(c.clave),
  );

  return filas.map(({ numero_fila, datos_originales, correccion }) => {
    // PB-024 (HU-019 CA2): lo corregido en los campos relacionados reemplaza
    // lo que trae el archivo, que no cambia.
    const valores = valoresDeFila(datos_originales, revision.mapeo, columnas);
    for (const [campo, valor] of Object.entries(correccion?.valores ?? {}))
      if (relacionados.has(campo)) valores[campo] = valor;
    const fila = new Fila(numero_fila, valores, revision, contexto, archivo);
    const resultado = () =>
      correccion ? { ...fila.resultado(), correccion } : fila.resultado();

    // Si quedó la fila de ejemplo de la plantilla, no se importa.
    if (
      conEjemplo.length >= 2 &&
      conEjemplo.every((c) => valores[c.clave] === c.ejemplo)
    ) {
      fila.datos = { ...valores };
      fila.error(null, 'Es la fila de ejemplo de la plantilla: bórrala.');
      return resultado();
    }

    for (const campo of campos)
      if (
        campo.obligatorio &&
        relacionados.has(campo.clave) &&
        !valores[campo.clave]
      )
        fila.error(campo.clave, 'Falta este dato obligatorio.');

    REVISAR[tipo](fila);
    return resultado();
  });
}

const REVISAR: Record<TipoImportacion, (fila: Fila) => void> = {
  ESTUDIANTES: revisarEstudiante,
  CURSOS: revisarCurso,
  PROFESORES: revisarProfesor,
  APODERADOS: revisarApoderado,
  MATRICULAS: revisarMatricula,
  ASIGNACIONES: revisarAsignacion,
};

// ===== Estudiantes (HU-014 y HU-020 CA3) =====

function revisarEstudiante(f: Fila) {
  const nacimiento = f.fecha('fecha_nacimiento');
  // Mismas reglas que la ficha del estudiante (PB-017).
  const ficha = f.reglas(() =>
    validarEstudiante({
      codigo_estudiante: f.valor('codigo_estudiante'),
      nombres: f.valor('nombres'),
      apellidos: f.valor('apellidos'),
      rut: f.valor('rut'),
      fecha_nacimiento: nacimiento ?? '',
      correo: f.valor('correo'),
      telefono: f.valor('telefono'),
      direccion: f.valor('direccion'),
    }),
  );
  if (nacimiento && nacimiento > f.contexto.hoy)
    f.error('fecha_nacimiento', 'La fecha de nacimiento no puede ser futura.');

  const codigo = f.valor('codigo_estudiante').toUpperCase();
  const rut = normalizarRut(f.valor('rut'));
  f.datos = ficha
    ? { ...ficha }
    : { ...f.valores, codigo_estudiante: codigo, rut: rut ?? f.valor('rut') };
  if (codigo) f.unica(`codigo:${codigo}`, 'codigo_estudiante', 'El código');
  if (rut) f.unica(`rut:${rut}`, 'rut', 'El RUT');

  // Un estudiante existente se reconoce por su código o su RUT, nunca solo
  // por el nombre (HU-020 CA3).
  const { porCodigoEstudiante, porRut, porNombre } = f.contexto;
  const porCodigo = codigo ? porCodigoEstudiante.get(codigo) : undefined;
  const conRut = rut ? porRut.get(rut) : undefined;
  let existente: PersonaExistente | undefined;
  if (conRut && !conRut.estudiante)
    f.error(
      'rut',
      `Ese RUT ya está en CONVI para ${conRut.nombre}, que no es estudiante.`,
    );
  else if (porCodigo && conRut && porCodigo.id !== conRut.id)
    f.error(
      'rut',
      `El código es de ${porCodigo.nombre} y el RUT es de ${conRut.nombre}.`,
    );
  else if (porCodigo?.rut && rut && porCodigo.rut !== rut)
    f.error(
      'rut',
      `En CONVI, ${porCodigo.nombre} (código ${codigo}) tiene otro RUT: ${porCodigo.rut}.`,
    );
  else existente = porCodigo ?? conRut;

  if (existente?.estudiante) {
    const otroCodigo =
      existente.estudiante.codigo === codigo
        ? ''
        : ` Su código en CONVI es ${existente.estudiante.codigo}.`;
    f.duplicado(
      'codigo_estudiante',
      `Ya existe el estudiante ${existente.nombre}.${otroCodigo}`,
    );
  } else if (ficha && !porCodigo && !conRut) {
    const mismo = porNombre
      .get(claveDeNombre(ficha.nombres, ficha.apellidos))
      ?.find((p) => p.estudiante);
    if (mismo?.estudiante)
      f.advertir(
        'nombres',
        `Hay un estudiante con el mismo nombre en CONVI (código ${mismo.estudiante.codigo}). Si es la misma persona, usa su código o su RUT.`,
      );
  }

  // Decisión del PO: el curso es opcional y, si viene, también se matricula.
  if (f.valor('curso'))
    revisarMatriculaEn(f, existente ?? null, 'codigo_estudiante');
  else if (f.valor('fecha_matricula'))
    f.advertir(
      'fecha_matricula',
      'Sin curso no hay matrícula: esta fecha no se usará.',
    );
}

// ===== Matrículas (HU-014 CA3) =====

function revisarMatricula(f: Fila) {
  const estudiante = buscarEstudiante(f);
  if (estudiante?.estudiante)
    f.unica(
      `estudiante:${estudiante.estudiante.id}`,
      'estudiante',
      `${estudiante.nombre}`,
    );
  revisarMatriculaEn(f, estudiante, 'estudiante');
}

/**
 * Curso del año elegido y fecha de la matrícula; si el estudiante ya existe,
 * que no quede con dos matrículas al mismo tiempo (como PB-018).
 */
function revisarMatriculaEn(
  f: Fila,
  persona: PersonaExistente | null,
  campoEstudiante: string,
) {
  const curso = buscarCurso(f);
  const anio = f.contexto.anio;
  let fecha = f.fecha('fecha_matricula');
  // Decisión del PO: sin fecha se usa el inicio del año.
  if (!f.valor('fecha_matricula') && anio) {
    fecha = anio.fecha_inicio;
    if (!fecha)
      f.error(
        'fecha_matricula',
        `Indica la fecha de matrícula: el año ${anio.anio} no tiene fecha de inicio.`,
      );
  } else if (
    fecha &&
    anio &&
    ((anio.fecha_inicio && fecha < anio.fecha_inicio) ||
      (anio.fecha_fin && fecha > anio.fecha_fin))
  )
    f.error(
      'fecha_matricula',
      `Elige una fecha dentro del año ${anio.anio}${
        anio.fecha_inicio && anio.fecha_fin
          ? ` (del ${fechaLegible(anio.fecha_inicio)} al ${fechaLegible(anio.fecha_fin)})`
          : ''
      }.`,
    );
  f.datos.curso = curso?.codigo ?? f.valor('curso').toUpperCase();
  f.datos.fecha_matricula = fecha;

  const estudiante = persona?.estudiante;
  if (!estudiante) return;
  if (estudiante.estado !== 'ACTIVO') {
    f.error(
      campoEstudiante,
      `La ficha de ${persona.nombre} está en estado ${estudiante.estado === 'EGRESADO' ? 'Egresado' : 'Inactivo'}: no se puede matricular.`,
    );
    return;
  }
  if (!curso || !fecha) return;
  // La nueva matrícula queda abierta: choca con cualquier otra que siga
  // vigente o que termine en esa fecha o después.
  const cruce = f.contexto.matriculas
    .get(estudiante.id)
    ?.find((m) => m.hasta === null || m.hasta >= fecha);
  if (!cruce) return;
  if (cruce.curso_id === curso.id && cruce.hasta === null)
    f.duplicado(
      'curso',
      `${persona.nombre} ya tiene matrícula en ${curso.nombre}.`,
    );
  else
    f.error(
      'curso',
      cruce.hasta
        ? `${persona.nombre} tuvo matrícula en ${cruce.curso_nombre} (${cruce.anio}) hasta el ${fechaLegible(cruce.hasta)}. La nueva debe empezar después.`
        : `${persona.nombre} ya tiene matrícula en ${cruce.curso_nombre} (${cruce.anio}) desde el ${fechaLegible(cruce.desde)}. No puede tener dos matrículas al mismo tiempo.`,
    );
}

/** El estudiante por su RUT o su código; tiene que estar ya en CONVI. */
function buscarEstudiante(f: Fila) {
  const valor = f.valor('estudiante');
  if (!valor) return null;
  const rut = normalizarRut(valor);
  const conRut = rut ? f.contexto.porRut.get(rut) : undefined;
  const persona = conRut?.estudiante
    ? conRut
    : f.contexto.porCodigoEstudiante.get(valor.toUpperCase());
  f.datos.estudiante = persona?.estudiante?.codigo ?? valor;
  if (!persona)
    f.error(
      'estudiante',
      `No hay un estudiante con el código o RUT ${valor} en CONVI. Impórtalo primero (tipo Estudiantes).`,
    );
  return persona ?? null;
}

/**
 * El curso por su código en el año elegido; no puede estar cerrado. PB-036
 * (HU-029 CA2): si no hay un código así, por su nombre, como «1° básico A»,
 * para usar los cursos que creó la guía con códigos automáticos.
 */
function buscarCurso(f: Fila): CursoExistente | null {
  const escrito = f.valor('curso');
  const valor = escrito.toUpperCase();
  const anio = f.contexto.anio;
  if (!valor || !anio) return null;
  const conNombre = f.contexto.cursosPorNombre.get(claveDeCurso(escrito)) ?? [];
  const curso =
    f.contexto.cursos.get(valor) ??
    (conNombre.length === 1 ? conNombre[0] : undefined);
  if (!curso) {
    f.error(
      'curso',
      conNombre.length > 1
        ? `Hay ${conNombre.length} cursos llamados ${escrito} en ${anio.anio}: escribe su código (${conNombre.map((c) => c.codigo).join(', ')}).`
        : `No hay un curso con código o nombre ${escrito} en ${anio.anio}. Créalo primero o revisa el año elegido.`,
    );
    return null;
  }
  if (['CERRADO', 'ARCHIVADO'].includes(curso.estado)) {
    f.error('curso', `El curso ${curso.nombre} está cerrado.`);
    return null;
  }
  return curso;
}

// ===== Cursos (HU-013) =====

function revisarCurso(f: Fila) {
  const codigo = f.valor('codigo').toUpperCase();
  if (codigo.length > LARGO_MAXIMO.codigo)
    f.error('codigo', `Usa como máximo ${LARGO_MAXIMO.codigo} caracteres.`);
  else if (codigo && !CODIGO.test(codigo))
    f.error(
      'codigo',
      'Usa solo letras, números, guion o guion bajo, sin espacios.',
    );
  const nombre = f.texto('nombre', LARGO_MAXIMO.nombre);
  const seccion = f.texto('seccion', LARGO_MAXIMO.seccion);

  const nivel = f.valor('nivel').toUpperCase();
  const existenteNivel = f.contexto.niveles.get(nivel);
  if (nivel && !existenteNivel)
    f.error(
      'nivel',
      `No hay un nivel con código ${nivel} en CONVI. Créalo primero en Niveles.`,
    );
  else if (existenteNivel && !existenteNivel.activo)
    f.error('nivel', `El nivel ${nivel} está desactivado.`);

  f.datos = { codigo, nombre, nivel, seccion };
  if (!codigo) return;
  f.unica(`curso:${codigo}`, 'codigo', 'El código');
  const existente = f.contexto.cursos.get(codigo);
  if (existente && f.contexto.anio)
    f.duplicado(
      'codigo',
      `Ya existe el curso ${codigo} (${existente.nombre}) en ${f.contexto.anio.anio}.`,
    );
}

// ===== Profesores y apoderados: datos de la persona =====

function revisarPersona(f: Fila) {
  const nombres = f.texto('nombres', LARGO_MAXIMO_ESTUDIANTE.nombres);
  const apellidos = f.texto('apellidos', LARGO_MAXIMO_ESTUDIANTE.apellidos);

  const rutEscrito = f.valor('rut');
  const rut = rutEscrito ? normalizarRut(rutEscrito) : null;
  if (rutEscrito && !rut)
    f.error(
      'rut',
      'El RUT no es válido. Revisa los números y el dígito verificador.',
    );

  const correo =
    f.texto('correo', LARGO_MAXIMO_ESTUDIANTE.correo)?.toLowerCase() ?? null;
  if (correo && !f.tieneError('correo') && !CORREO.test(correo))
    f.error(
      'correo',
      'Escribe un correo válido, por ejemplo nombre@correo.cl.',
    );

  const telefono = f.texto('telefono', LARGO_MAXIMO_ESTUDIANTE.telefono);
  if (
    telefono &&
    !f.tieneError('telefono') &&
    (!TELEFONO.test(telefono) || telefono.replace(/\D/g, '').length < 8)
  )
    f.error(
      'telefono',
      'Escribe un teléfono válido, por ejemplo +56 9 1234 5678.',
    );

  return { nombres, apellidos, rut, correo, telefono };
}

// ===== Profesores (HU-009) =====

function revisarProfesor(f: Fila) {
  const persona = revisarPersona(f);
  f.datos = { ...persona, rut: persona.rut ?? (f.valor('rut') || null) };
  const { correo, rut } = persona;
  if (correo) f.unica(`correo:${correo}`, 'correo', 'El correo');
  if (rut) f.unica(`rut:${rut}`, 'rut', 'El RUT');

  // Una persona tiene una sola cuenta por escuela (convi.membresias_establecimiento).
  const conCorreo =
    correo && !f.tieneError('correo')
      ? f.contexto.porCorreoDeCuenta.get(correo)
      : undefined;
  const conRut = rut ? f.contexto.porRut.get(rut) : undefined;
  if (conCorreo?.cuenta && conCorreo.cuenta.perfil !== 'PROFESOR')
    f.error(
      'correo',
      `Ese correo ya tiene una cuenta de ${NOMBRE_PERFIL[conCorreo.cuenta.perfil] ?? conCorreo.cuenta.perfil} en la escuela.`,
    );
  else if (conRut?.estudiante)
    f.error('rut', `Ese RUT es de un estudiante (${conRut.nombre}).`);
  else if (conRut?.cuenta && conRut.cuenta.perfil !== 'PROFESOR')
    f.error(
      'rut',
      `Ese RUT es de ${conRut.nombre}, que tiene una cuenta de ${NOMBRE_PERFIL[conRut.cuenta.perfil] ?? conRut.cuenta.perfil}.`,
    );
  else if (conCorreo && conRut && conCorreo.id !== conRut.id)
    f.error(
      'rut',
      `El correo es de ${conCorreo.nombre} y el RUT es de ${conRut.nombre}.`,
    );
  else {
    const existente = conCorreo ?? (conRut?.cuenta ? conRut : undefined);
    if (existente?.cuenta)
      f.duplicado(
        'correo',
        existente.cuenta.correo === correo
          ? `${existente.nombre} ya tiene cuenta de Profesor en la escuela.`
          : `${existente.nombre} ya tiene cuenta de Profesor en la escuela, con el correo ${existente.cuenta.correo}.`,
      );
  }
}

// ===== Apoderados (HU-010) =====

function revisarApoderado(f: Fila) {
  const estudiante = buscarEstudiante(f);
  const persona = revisarPersona(f);
  const direccion = f.texto('direccion', LARGO_MAXIMO_ESTUDIANTE.direccion);
  const parentesco = f.texto('parentesco', 60);
  const principal = leerSiNo(f.valor('principal'), false);
  if (principal === null) f.error('principal', 'Escribe Sí o No.');
  const contactable = leerSiNo(f.valor('contactable'), true);
  if (contactable === null) f.error('contactable', 'Escribe Sí o No.');
  f.datos = {
    estudiante: f.datos.estudiante ?? null,
    ...persona,
    rut: persona.rut ?? (f.valor('rut') || null),
    direccion,
    parentesco,
    principal,
    contactable,
  };

  // La persona del apoderado: por su RUT o, si no trae, por su correo.
  const { rut, correo } = persona;
  const conRut = rut ? f.contexto.porRut.get(rut) : undefined;
  const conCorreo =
    !rut && correo ? f.contexto.porCorreo.get(correo) : undefined;
  let existente: PersonaExistente | undefined;
  if (conRut?.estudiante)
    f.error('rut', `Ese RUT es de un estudiante (${conRut.nombre}).`);
  else existente = conRut ?? (conCorreo?.estudiante ? undefined : conCorreo);
  if (existente && !conRut)
    f.advertir(
      'correo',
      `Se usará la ficha de ${existente.nombre}, que tiene ese correo en CONVI.`,
    );
  if (
    !existente &&
    !rut &&
    !correo &&
    persona.nombres &&
    persona.apellidos &&
    f.contexto.porNombre
      .get(claveDeNombre(persona.nombres, persona.apellidos))
      ?.some((p) => !p.estudiante)
  )
    f.advertir(
      'nombres',
      'Hay una persona con el mismo nombre en CONVI. Sin RUT ni correo se creará otra ficha: agrega su RUT si es la misma persona.',
    );

  const vinculado = estudiante?.estudiante;
  if (!vinculado) return;
  const deApoderado =
    rut ??
    correo ??
    claveDeNombre(persona.nombres ?? '', persona.apellidos ?? '');
  f.unica(
    `vinculo:${vinculado.id}:${deApoderado}`,
    'estudiante',
    `La misma persona como apoderado de ${estudiante.nombre}`,
  );
  const vinculos = f.contexto.vinculos.get(vinculado.id) ?? [];
  if (existente && vinculos.some((v) => v.persona_id === existente.id))
    f.duplicado(
      'estudiante',
      `${existente.nombre} ya figura como apoderado de ${estudiante.nombre}.`,
    );

  if (!principal) return;
  const actual = vinculos.find(
    (v) => v.principal && v.vigente && v.persona_id !== existente?.id,
  );
  const enArchivo = f.archivo.vistos.get(`principal:${vinculado.id}`);
  if (actual)
    f.advertir(
      'principal',
      `${estudiante.nombre} ya tiene como apoderado principal a ${actual.nombre}.`,
    );
  else if (enArchivo !== undefined)
    f.advertir(
      'principal',
      `${estudiante.nombre} ya tiene apoderado principal en la fila ${enArchivo}.`,
    );
  else f.archivo.vistos.set(`principal:${vinculado.id}`, f.numero);
}

// ===== Asignaciones de profesores (HU-013) =====

function revisarAsignacion(f: Fila) {
  const profesor = buscarProfesor(f);
  const curso = buscarCurso(f);
  const rol = f.valor('rol') ? leerRol(f.valor('rol')) : null;
  if (f.valor('rol') && !rol)
    f.error('rol', 'Escribe Profesor jefe o Profesor.');

  const anio = f.contexto.anio;
  let inicio = f.fecha('fecha_inicio');
  // Decisión del PO: sin fecha se usa el inicio del año.
  if (!f.valor('fecha_inicio') && anio) {
    inicio = anio.fecha_inicio;
    if (!inicio)
      f.error(
        'fecha_inicio',
        `Indica la fecha de inicio: el año ${anio.anio} no tiene fecha de inicio.`,
      );
  }
  const fin = f.fecha('fecha_fin');
  if (fin && inicio && fin < inicio)
    f.error('fecha_fin', 'El último día no puede ser anterior al inicio.');

  f.datos = {
    profesor: profesor?.cuenta?.correo ?? (f.valor('profesor') || null),
    curso: curso?.codigo ?? f.valor('curso').toUpperCase(),
    rol,
    fecha_inicio: inicio,
    fecha_fin: fin,
  };
  const cuenta = profesor?.cuenta;
  if (
    !profesor ||
    !cuenta ||
    !curso ||
    !rol ||
    !inicio ||
    f.tieneError('fecha_fin')
  )
    return;

  // CA3 de HU-013: el mismo profesor no repite rol en el curso con fechas que
  // se cruzan, y el curso tiene un solo profesor jefe a la vez (PB-015).
  const cruza = (a: { desde: string | null; hasta: string | null }) =>
    seCruzan(a.desde, a.hasta, inicio, fin);
  const existentes = f.contexto.asignaciones.get(curso.id) ?? [];
  const repetida = existentes.find(
    (a) => a.cuenta_id === cuenta.id && a.rol === rol && cruza(a),
  );
  const otroJefe =
    rol === 'PROFESOR_JEFE'
      ? existentes.find(
          (a) =>
            a.rol === 'PROFESOR_JEFE' && a.cuenta_id !== cuenta.id && cruza(a),
        )
      : undefined;
  if (repetida)
    f.duplicado(
      'profesor',
      `${profesor.nombre} ya tiene el rol ${NOMBRE_ROL[rol]} en ${curso.nombre} en esas fechas.`,
    );
  else if (otroJefe)
    f.error(
      'rol',
      `${curso.nombre} ya tiene profesor jefe en esas fechas (${otroJefe.nombre}). Termina esa asignación antes de importar otra.`,
    );

  const enArchivo = f.archivo.asignaciones.get(curso.id) ?? [];
  const previa = enArchivo.find(
    (a) =>
      cruza(a) &&
      ((a.cuenta_id === cuenta.id && a.rol === rol) ||
        (rol === 'PROFESOR_JEFE' && a.rol === 'PROFESOR_JEFE')),
  );
  if (previa) {
    const misma = previa.cuenta_id === cuenta.id && previa.rol === rol;
    f.error(
      misma ? 'profesor' : 'rol',
      misma
        ? `La misma asignación ya aparece en la fila ${previa.fila}.`
        : `La fila ${previa.fila} ya pone otro profesor jefe en ${curso.nombre} en esas fechas.`,
    );
  } else
    f.archivo.asignaciones.set(curso.id, [
      ...enArchivo,
      { cuenta_id: cuenta.id, rol, desde: inicio, hasta: fin, fila: f.numero },
    ]);
}

/** El profesor por el correo de su cuenta o por su RUT; activo o pendiente. */
function buscarProfesor(f: Fila) {
  const valor = f.valor('profesor');
  if (!valor) return null;
  const rut = valor.includes('@') ? null : normalizarRut(valor);
  const persona = valor.includes('@')
    ? f.contexto.porCorreoDeCuenta.get(valor.toLowerCase())
    : rut
      ? f.contexto.porRut.get(rut)
      : undefined;
  const cuenta = persona?.cuenta;
  if (!persona || !cuenta)
    f.error(
      'profesor',
      `No hay un profesor con el correo o RUT ${valor} en CONVI. Invítalo o impórtalo primero (tipo Profesores).`,
    );
  else if (cuenta.perfil !== 'PROFESOR')
    f.error(
      'profesor',
      `${persona.nombre} tiene una cuenta de ${NOMBRE_PERFIL[cuenta.perfil] ?? cuenta.perfil}, no de Profesor.`,
    );
  // Decisión del PO de PB-015: se asignan profesores activos o pendientes.
  else if (!['ACTIVO', 'PENDIENTE'].includes(cuenta.estado))
    f.error(
      'profesor',
      `La cuenta de ${persona.nombre} está ${cuenta.estado === 'SUSPENDIDO' ? 'suspendida' : 'revocada'}.`,
    );
  else return persona;
  return null;
}
