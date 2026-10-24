import { Azar } from './azar.js';
import {
  ANIOS_ESCOLARES,
  FECHA_CORTE,
  MOMENTO_CORTE,
  anioDe,
  diaDe,
  diaDeMomento,
  diaHabil,
  diaSemana,
  esDiaDeClases,
  mesDe,
  momento,
  textoDia,
  textoMomento,
  type AnioEscolar,
} from './calendario.js';
import {
  APELLIDOS,
  CATEGORIAS,
  FUNDAMENTOS,
  LUGARES,
  MOTIVOS_CAMBIO,
  NIVELES,
  NOMBRES,
  PREGUNTAS,
  RESPUESTAS,
  RESUMENES_CIERRE,
  SECCIONES,
  type CategoriaPlan,
  type NivelPlan,
} from './catalogos.js';

// PB-159 (HU-137): arma en memoria todos los datos ficticios de dos escuelas a
// partir de una semilla. No toca la base: la misma semilla y cantidad dan
// siempre las mismas filas (CA2), que después se cargan y verifican aparte.

export const VERSION_GENERADOR = 1;
/** HU-137 CA1: al menos 10 000 situaciones en total. */
export const MINIMO_SITUACIONES = 10_000;
export const SEMILLA_VALIDA = /^[A-Za-z0-9-]{1,20}$/;
const PLAZO_CIERRE_DIAS = 45;

export type Valor = string | number | boolean | null;
export type Fila = Record<string, Valor>;

/** Orden de carga de las tablas. */
export const TABLAS = [
  'establecimientos',
  'niveles_educativos',
  'anios_academicos',
  'cursos',
  'personas',
  'estudiantes',
  'membresias_establecimiento',
  'asignaciones_docentes',
  'matriculas',
  'categorias_convivencia',
  'casos',
  'situaciones',
  'participaciones',
  'revisiones_convivencia',
  'aclaraciones_situacion',
  'historial_estados_caso',
] as const;
export type Tabla = (typeof TABLAS)[number];

export type Perfil = 'ADMIN' | 'CONVIVENCIA' | 'PROFESOR';

/** Identidad de Supabase Auth de una cuenta del personal sintético. */
export type CuentaPlan = {
  id: string;
  correo: string;
  nombre: string;
  perfil: Perfil;
  escuela: string;
  /** HU-137: una cuenta de Convivencia por escuela puede entrar con clave. */
  conAcceso: boolean;
};

export type EscuelaPlan = { id: string; codigo: string; nombre: string };

export type Resumen = {
  escuelas: number;
  estudiantes: number;
  estudiantes_activos: number;
  matriculas: number;
  personal: number;
  cursos: number;
  situaciones: number;
  participaciones: number;
  decisiones: number;
  aclaraciones: number;
  casos: number;
  cambios_de_estado: number;
  situaciones_por_anio: Record<string, number>;
  situaciones_por_estado: Record<string, number>;
  casos_por_estado: Record<string, number>;
};

export type Plan = {
  semilla: string;
  fecha_corte: string;
  escuelas: EscuelaPlan[];
  tablas: Record<Tabla, Fila[]>;
  cuentas: CuentaPlan[];
  resumen: Resumen;
};

export type OpcionesPlan = { semilla: string; situaciones: number };

const ESCUELAS = [
  {
    clave: 'NORTE',
    nombre: 'Escuela Sintética Norte',
    region: 'Región de Coquimbo',
    comuna: 'La Serena',
  },
  {
    clave: 'SUR',
    nombre: 'Escuela Sintética Sur',
    region: 'Región del Biobío',
    comuna: 'Concepción',
  },
] as const;

/** HU-137 CA3: las escuelas sintéticas se reconocen por su código. */
export function codigoEscuela(semilla: string, clave: string): string {
  return `SINTETICA-${semilla}-${clave}`;
}

export function dominioEscuela(semilla: string, clave: string): string {
  return `${clave.toLowerCase()}-${semilla.toLowerCase()}.sintetico.convi.test`;
}

/** Correo para entrar con la cuenta de Convivencia de una escuela. */
export function correoAcceso(semilla: string, clave: string): string {
  return `convivencia@${dominioEscuela(semilla, clave)}`;
}

function sinTildes(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function digitoVerificador(cuerpo: number): string {
  let suma = 0;
  let factor = 2;
  for (const digito of String(cuerpo).split('').reverse()) {
    suma += Number(digito) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  return resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
}

// --- Tipos internos ---

type Miembro = {
  membresiaId: string;
  personaId: string;
  perfil: Perfil;
};

type Curso = {
  id: string;
  anio: AnioEscolar;
  nivel: NivelPlan;
  seccion: string;
  nombre: string;
  peso: number;
  jefe: Miembro;
  profesores: Miembro[];
};

type Estudiante = {
  id: string;
  personaId: string;
  propension: number;
  estado: 'ACTIVO' | 'INACTIVO' | 'EGRESADO';
  matriculas: Matricula[];
};

type Matricula = {
  id: string;
  estudiante: Estudiante;
  curso: Curso;
  desde: number;
  hasta: number | null;
  estado: 'ACTIVO' | 'TRASLADADO' | 'COMPLETADO' | 'RETIRADO';
};

type Participante = { personaId: string; rol: string; matriculaId: string };

type Situacion = {
  id: string;
  curso: Curso;
  reportadoPor: Miembro;
  ocurrido: number;
  reportado: number;
  categoria: CategoriaPlan;
  categoriaId: string;
  participantes: Participante[];
  fila: Fila;
  ultimaRevision: string | null;
};

type Transicion = {
  anterior: string;
  nuevo: string;
  en: number;
};

type Caso = {
  id: string;
  registrado: number;
  responsable: Miembro;
  transiciones: Transicion[];
  personas: Set<string>;
  fila: Fila;
};

/** Pondera según la semilla y quita el elegido para no repetirlo. */
function elegirVarios<T>(
  azar: Azar,
  lista: readonly T[],
  peso: (elemento: T) => number,
  cantidad: number,
): T[] {
  const restantes = [...lista];
  const elegidos: T[] = [];
  while (elegidos.length < cantidad && restantes.length > 0) {
    const indice = azar.ponderado(
      restantes.map((e, i) => [i, peso(e)] as const),
    );
    elegidos.push(restantes[indice]);
    restantes.splice(indice, 1);
  }
  return elegidos;
}

/** Lleva un momento al horario de oficina (lunes a viernes, 8:30 a 18:00). */
function enHorario(azar: Azar, minutos: number): number {
  let dia = diaDeMomento(minutos);
  const minutoDelDia = minutos - momento(dia, 0);
  if (minutoDelDia > 18 * 60) dia += 1;
  const habil = diaHabil(dia);
  if (habil !== dia || minutoDelDia < 8 * 60 + 30 || minutoDelDia > 18 * 60)
    return momento(habil, azar.entero(8, 12), azar.entero(30, 59));
  return minutos;
}

const minutosDias = (dias: number) => dias * 24 * 60;

class GeneradorEscuela {
  readonly escuela: EscuelaPlan;
  private readonly dominio: string;
  private readonly creada: number;
  private niveles = new Map<string, string>();
  private anios = new Map<number, string>();
  private cursos: Curso[] = [];
  private admin!: Miembro;
  private convivencia: Miembro[] = [];
  private profesores: Miembro[] = [];
  private categorias: { id: string; categoria: CategoriaPlan }[] = [];
  private estudiantes: Estudiante[] = [];
  private codigosEstudiante = 0;
  private situaciones: Situacion[] = [];
  private casos: Caso[] = [];
  private casosDePersona = new Map<string, Caso[]>();
  private matriculasDeCurso = new Map<Curso, Matricula[]>();

  constructor(
    private readonly azar: Azar,
    private readonly definicion: (typeof ESCUELAS)[number],
    private readonly semilla: string,
    private readonly tablas: Record<Tabla, Fila[]>,
    private readonly cuentas: CuentaPlan[],
    private readonly ruts: Set<number>,
  ) {
    this.escuela = {
      id: azar.uuid(),
      codigo: codigoEscuela(semilla, definicion.clave),
      nombre: `${definicion.nombre} (semilla ${semilla})`,
    };
    this.dominio = dominioEscuela(semilla, definicion.clave);
    this.creada = momento(diaDe('2024-02-12'), 10, 0);
  }

  generar(cantidadSituaciones: number) {
    this.crearEscuela();
    this.crearEstructura();
    this.crearPersonal();
    this.crearAsignaciones();
    this.crearCategorias();
    this.crearEstudiantes();
    this.crearSituaciones(cantidadSituaciones);
    this.asignarCodigos(
      this.situaciones.map((s) => ({ fila: s.fila, momento: s.reportado })),
      'SIT',
    );
    this.decidir();
    this.asignarCodigos(
      this.casos.map((c) => ({ fila: c.fila, momento: c.registrado })),
      'CASO',
    );
    this.completarCasos();
  }

  private agregar(tabla: Tabla, fila: Fila) {
    this.tablas[tabla].push({ establecimiento_id: this.escuela.id, ...fila });
  }

  private crearEscuela() {
    this.tablas.establecimientos.push({
      id: this.escuela.id,
      nombre: this.escuela.nombre,
      codigo: this.escuela.codigo,
      region: this.definicion.region,
      comuna: this.definicion.comuna,
      estado: 'ACTIVO',
      creado_en: textoMomento(this.creada),
      actualizado_en: textoMomento(this.creada),
      zona_horaria: 'America/Santiago',
      configuracion_regional: 'es-CL',
      contexto_onboarding: '{}',
      onboarding_completado_en: textoMomento(this.creada),
      direccion: `Avenida Ficticia ${this.azar.entero(100, 2999)}`,
      correo_contacto: `contacto@${this.dominio}`,
      plazo_cierre_dias: PLAZO_CIERRE_DIAS,
    });
  }

  private crearEstructura() {
    for (const nivel of NIVELES) {
      const id = this.azar.uuid();
      this.niveles.set(nivel.codigo, id);
      this.agregar('niveles_educativos', {
        id,
        codigo: nivel.codigo,
        nombre: nivel.nombre,
        orden: nivel.orden,
        ciclo: nivel.ciclo,
        tramo: nivel.tramo,
        activo: true,
      });
    }
    for (const anio of ANIOS_ESCOLARES) {
      const id = this.azar.uuid();
      this.anios.set(anio.anio, id);
      this.agregar('anios_academicos', {
        id,
        anio: anio.anio,
        fecha_inicio: textoDia(anio.inicio),
        fecha_fin: textoDia(anio.fin),
        estado: anio.estado,
      });
    }
  }

  private nuevaPersona(
    nombres: string,
    apellidos: string,
    creada: number,
    correo: string | null,
    rut: string | null,
  ) {
    const id = this.azar.uuid();
    this.agregar('personas', {
      id,
      nombres,
      apellidos,
      correo,
      estado: 'ACTIVO',
      creado_en: textoMomento(creada),
      rut,
    });
    return id;
  }

  private nombreAlAzar() {
    const nombres = this.azar.probabilidad(0.6)
      ? `${this.azar.elegir(NOMBRES)} ${this.azar.elegir(NOMBRES)}`
      : this.azar.elegir(NOMBRES);
    const apellidos = `${this.azar.elegir(APELLIDOS)} ${this.azar.elegir(APELLIDOS)}`;
    return { nombres, apellidos };
  }

  /** RUT válido del rango 40 a 49 millones, que no se repite. */
  private rutAlAzar() {
    for (;;) {
      const cuerpo = this.azar.entero(40_000_000, 49_999_999);
      if (this.ruts.has(cuerpo)) continue;
      this.ruts.add(cuerpo);
      return `${cuerpo}-${digitoVerificador(cuerpo)}`;
    }
  }

  private crearPersonal() {
    const invitar = (
      perfil: Perfil,
      indice: number,
      acceso: boolean,
    ): Miembro => {
      const { nombres, apellidos } = this.nombreAlAzar();
      const correo = acceso
        ? correoAcceso(this.semilla, this.definicion.clave)
        : `${sinTildes(nombres.split(' ')[0])}.${sinTildes(apellidos.split(' ')[0])}.${perfil.toLowerCase()}${indice}@${this.dominio}`;
      const invitado =
        this.creada + minutosDias(perfil === 'ADMIN' ? 0 : 1) + indice * 7;
      const activado = invitado + this.azar.entero(30, minutosDias(3));
      const personaId = this.nuevaPersona(
        nombres,
        apellidos,
        invitado,
        correo,
        null,
      );
      const membresiaId = this.azar.uuid();
      const authId = this.azar.uuid();
      this.agregar('membresias_establecimiento', {
        id: membresiaId,
        persona_id: personaId,
        codigo_perfil: perfil,
        estado: 'ACTIVO',
        invitado_por: perfil === 'ADMIN' ? null : this.admin.membresiaId,
        invitado_en: perfil === 'ADMIN' ? null : textoMomento(invitado),
        activado_en: textoMomento(activado),
        auth_usuario_id: authId,
        correo_invitacion: correo,
      });
      this.cuentas.push({
        id: authId,
        correo,
        nombre: `${nombres} ${apellidos}`,
        perfil,
        escuela: this.escuela.codigo,
        conAcceso: acceso,
      });
      return { membresiaId, personaId, perfil };
    };
    this.admin = invitar('ADMIN', 1, false);
    for (let i = 1; i <= 3; i++)
      this.convivencia.push(invitar('CONVIVENCIA', i, i === 1));
    for (let i = 1; i <= 30; i++)
      this.profesores.push(invitar('PROFESOR', i, false));
  }

  private crearAsignaciones() {
    for (const anio of ANIOS_ESCOLARES) {
      const jefes = this.azar.mezclar(this.profesores);
      let indice = 0;
      for (const nivel of NIVELES) {
        for (const seccion of SECCIONES) {
          const jefe = jefes[indice++];
          const otros = this.azar.muestra(
            this.profesores.filter((p) => p !== jefe),
            2,
          );
          const curso: Curso = {
            id: this.azar.uuid(),
            anio,
            nivel,
            seccion,
            nombre: `${nivel.nombre} ${seccion}`,
            // Algunos cursos concentran más situaciones que otros.
            peso:
              nivel.peso *
              this.azar.ponderado([
                [1, 70],
                [1.8, 20],
                [3, 10],
              ] as const),
            jefe,
            profesores: otros,
          };
          this.cursos.push(curso);
          this.agregar('cursos', {
            id: curso.id,
            anio_academico_id: this.anios.get(anio.anio) ?? null,
            codigo: `${nivel.orden}${seccion}`,
            nombre: curso.nombre,
            nivel_id: this.niveles.get(nivel.codigo) ?? null,
            seccion,
            estado: 'ACTIVO',
          });
          for (const [miembro, rol] of [
            [jefe, 'PROFESOR_JEFE'],
            ...otros.map((p) => [p, 'PROFESOR'] as const),
          ] as const)
            this.agregar('asignaciones_docentes', {
              id: this.azar.uuid(),
              curso_id: curso.id,
              membresia_id: miembro.membresiaId,
              rol_asignacion: rol,
              fecha_inicio: textoDia(anio.inicio),
              fecha_fin: anio.estado === 'CERRADO' ? textoDia(anio.fin) : null,
            });
        }
      }
    }
  }

  private crearCategorias() {
    for (const categoria of CATEGORIAS) {
      const id = this.azar.uuid();
      this.categorias.push({ id, categoria });
      this.agregar('categorias_convivencia', {
        id,
        nombre: categoria.nombre,
        descripcion: categoria.descripcion,
        estado: 'ACTIVO',
      });
    }
  }

  private cursoDe(anio: number, orden: number, seccion: string): Curso {
    const curso = this.cursos.find(
      (c) =>
        c.anio.anio === anio &&
        c.nivel.orden === orden &&
        c.seccion === seccion,
    );
    if (!curso)
      throw new Error(`No existe el curso ${orden}${seccion} ${anio}`);
    return curso;
  }

  private nuevoEstudiante(
    anio: AnioEscolar,
    orden: number,
    desde: number,
  ): Estudiante {
    const { nombres, apellidos } = this.nombreAlAzar();
    const personaId = this.nuevaPersona(
      nombres,
      apellidos,
      momento(desde, 9, 0),
      null,
      this.rutAlAzar(),
    );
    const id = this.azar.uuid();
    this.codigosEstudiante++;
    const nacimiento =
      diaDe(`${anio.anio - 6 - (orden - 1)}-01-01`) - this.azar.entero(0, 364);
    const estudiante: Estudiante = {
      id,
      personaId,
      propension: this.azar.ponderado([
        [1, 70],
        [3, 20],
        [8, 8],
        [20, 2],
      ] as const),
      estado: 'ACTIVO',
      matriculas: [],
    };
    this.estudiantes.push(estudiante);
    this.agregar('estudiantes', {
      id,
      persona_id: personaId,
      codigo_estudiante: `E${anioDe(desde)}-${String(this.codigosEstudiante).padStart(4, '0')}`,
      fecha_nacimiento: textoDia(nacimiento),
      estado: 'ACTIVO',
    });
    return estudiante;
  }

  private matricular(
    estudiante: Estudiante,
    curso: Curso,
    desde: number,
  ): Matricula {
    const matricula: Matricula = {
      id: this.azar.uuid(),
      estudiante,
      curso,
      desde,
      hasta: null,
      estado: 'ACTIVO',
    };
    estudiante.matriculas.push(matricula);
    const delCurso = this.matriculasDeCurso.get(curso) ?? [];
    delCurso.push(matricula);
    this.matriculasDeCurso.set(curso, delCurso);
    return matricula;
  }

  /**
   * HU-137 CA1: matrículas coherentes año a año. Cada estudiante avanza un
   * nivel (algunos repiten), los de IV medio egresan, entran cursos nuevos de
   * 1° básico y durante el año hay retiros, cambios de sección y llegadas.
   */
  private crearEstudiantes() {
    const corte = diaDe(FECHA_CORTE);
    let continuan: {
      estudiante: Estudiante;
      orden: number;
      seccion: string;
    }[] = [];
    for (const anio of ANIOS_ESCOLARES) {
      const ultimoDia = Math.min(anio.fin, corte);
      const enCurso = new Map<string, Estudiante[]>();
      const clave = (orden: number, seccion: string) => `${orden}${seccion}`;
      for (const { estudiante, orden, seccion } of continuan) {
        const nuevoOrden = this.azar.probabilidad(0.02) ? orden : orden + 1;
        if (nuevoOrden > 12) continue;
        const lista = enCurso.get(clave(nuevoOrden, seccion)) ?? [];
        lista.push(estudiante);
        enCurso.set(clave(nuevoOrden, seccion), lista);
      }
      // Cada curso parte con 38 a 44 estudiantes: los que faltan son nuevos.
      for (const nivel of NIVELES)
        for (const seccion of SECCIONES) {
          const lista = enCurso.get(clave(nivel.orden, seccion)) ?? [];
          const meta =
            nivel.orden === 1
              ? this.azar.entero(40, 45)
              : this.azar.entero(38, 44);
          while (lista.length < meta)
            lista.push(this.nuevoEstudiante(anio, nivel.orden, anio.inicio));
          enCurso.set(clave(nivel.orden, seccion), lista);
        }

      const activas: Matricula[] = [];
      for (const nivel of NIVELES)
        for (const seccion of SECCIONES) {
          const curso = this.cursoDe(anio.anio, nivel.orden, seccion);
          for (const estudiante of enCurso.get(clave(nivel.orden, seccion)) ??
            [])
            activas.push(this.matricular(estudiante, curso, anio.inicio));
          // Llegadas durante el año.
          for (let i = this.azar.entero(0, 2); i > 0; i--) {
            const desde = diaHabil(anio.inicio + this.azar.entero(20, 150));
            if (desde > ultimoDia) continue;
            const estudiante = this.nuevoEstudiante(anio, nivel.orden, desde);
            activas.push(this.matricular(estudiante, curso, desde));
          }
        }

      const siguientes: typeof continuan = [];
      for (const matricula of activas) {
        const { estudiante, curso } = matricula;
        const limite = Math.max(matricula.desde + 1, anio.fin - 20);
        const dia = diaHabil(
          this.azar.entero(Math.min(matricula.desde + 30, limite), limite),
        );
        if (this.azar.probabilidad(0.03) && dia <= ultimoDia) {
          matricula.hasta = dia;
          matricula.estado = 'RETIRADO';
          estudiante.estado = 'INACTIVO';
          continue;
        }
        let ultima = matricula;
        if (this.azar.probabilidad(0.01) && diaHabil(dia + 1) <= ultimoDia) {
          matricula.hasta = dia;
          matricula.estado = 'TRASLADADO';
          const otra = this.cursoDe(
            anio.anio,
            curso.nivel.orden,
            curso.seccion === 'A' ? 'B' : 'A',
          );
          ultima = this.matricular(estudiante, otra, diaHabil(dia + 1));
        }
        if (anio.estado === 'CERRADO') {
          ultima.hasta = anio.fin;
          ultima.estado = 'COMPLETADO';
          if (ultima.curso.nivel.orden === 12) {
            estudiante.estado = 'EGRESADO';
            continue;
          }
        }
        siguientes.push({
          estudiante,
          orden: ultima.curso.nivel.orden,
          seccion: ultima.curso.seccion,
        });
      }
      continuan = siguientes;
    }

    for (const estudiante of this.estudiantes) {
      const fila = this.tablas.estudiantes.find((f) => f.id === estudiante.id);
      if (fila) fila.estado = estudiante.estado;
      for (const m of estudiante.matriculas)
        this.agregar('matriculas', {
          id: m.id,
          estudiante_id: estudiante.id,
          curso_id: m.curso.id,
          anio_academico_id: this.anios.get(m.curso.anio.anio) ?? null,
          estado: m.estado,
          matriculado_en: textoDia(m.desde),
          finalizado_en: m.hasta === null ? null : textoDia(m.hasta),
        });
    }
  }

  private matriculadosEn(curso: Curso, dia: number): Matricula[] {
    return (this.matriculasDeCurso.get(curso) ?? []).filter(
      (m) => m.desde <= dia && (m.hasta === null || m.hasta >= dia),
    );
  }

  /**
   * HU-137 CA1 y CA4: situaciones repartidas en los días de clases de los tres
   * años, con más casos en algunos meses, niveles y cursos, estudiantes que
   * se repiten (para las reglas de recurrencia) y un alza marcada en un curso
   * en septiembre de 2026 (para las reglas de variación).
   */
  private crearSituaciones(cantidad: number) {
    const corte = diaDe(FECHA_CORTE);
    const factorAnio: Record<number, number> = {
      2024: 0.85,
      2025: 1,
      2026: 1.15,
    };
    const factorMes: Record<number, number> = {
      3: 0.8,
      4: 1,
      5: 1.1,
      6: 1,
      7: 0.8,
      8: 1,
      9: 1.05,
      10: 1.15,
      11: 1,
      12: 0.5,
    };
    const factorSemana: Record<number, number> = {
      1: 1.1,
      2: 1,
      3: 1,
      4: 1,
      5: 0.85,
    };
    const dias: { anio: AnioEscolar; dia: number }[] = [];
    const acumulado: number[] = [];
    let total = 0;
    for (const anio of ANIOS_ESCOLARES)
      for (let dia = anio.inicio; dia <= Math.min(anio.fin, corte); dia++) {
        if (!esDiaDeClases(anio, dia)) continue;
        total +=
          factorAnio[anio.anio] *
          (factorMes[mesDe(dia)] ?? 1) *
          factorSemana[diaSemana(dia)];
        dias.push({ anio, dia });
        acumulado.push(total);
      }

    const alza = this.azar.elegir(
      this.cursos.filter((c) => c.anio.anio === 2026 && c.nivel.orden >= 6),
    );
    const alzaDesde = diaDe('2026-09-07');
    const alzaHasta = diaDe('2026-10-09');
    const matriculadosCache = new Map<string, Matricula[]>();
    const matriculados = (curso: Curso, dia: number) => {
      const clave = `${curso.id}:${dia}`;
      let lista = matriculadosCache.get(clave);
      if (!lista) {
        lista = this.matriculadosEn(curso, dia);
        matriculadosCache.set(clave, lista);
      }
      return lista;
    };

    while (this.situaciones.length < cantidad) {
      const punto = this.azar.siguiente() * total;
      let bajo = 0;
      let alto = acumulado.length - 1;
      while (bajo < alto) {
        const medio = (bajo + alto) >> 1;
        if (acumulado[medio] > punto) alto = medio;
        else bajo = medio + 1;
      }
      const { anio, dia } = dias[bajo];
      const cursosAnio = this.cursos.filter((c) => c.anio === anio);
      const curso = this.azar.ponderado(
        cursosAnio.map(
          (c) =>
            [
              c,
              c.peso *
                (c === alza && dia >= alzaDesde && dia <= alzaHasta ? 4 : 1),
            ] as const,
        ),
      );
      const presentes = matriculados(curso, dia);
      if (presentes.length === 0) continue;

      const cantidadParticipantes = this.azar.ponderado([
        [1, 55],
        [2, 30],
        [3, 11],
        [4, 3],
        [5, 1],
      ] as const);
      const elegidos = elegirVarios(
        this.azar,
        presentes,
        (m) => m.estudiante.propension,
        cantidadParticipantes,
      );
      // A veces participa alguien de otro curso del mismo nivel.
      if (this.azar.probabilidad(0.08)) {
        const otro = cursosAnio.find(
          (c) => c.nivel === curso.nivel && c !== curso,
        );
        const deOtro = otro ? matriculados(otro, dia) : [];
        if (deOtro.length > 0) elegidos.push(this.azar.elegir(deOtro));
      }
      const participantes = elegidos.map((m, i) => ({
        personaId: m.estudiante.personaId,
        rol:
          elegidos.length === 1
            ? this.azar.elegir(['AFECTADO', 'INVOLUCRADO'])
            : i === 0
              ? 'AFECTADO'
              : i === 1
                ? 'INVOLUCRADO'
                : this.azar.ponderado([
                    ['INVOLUCRADO', 60],
                    ['TESTIGO', 40],
                  ] as const),
        matriculaId: m.id,
      }));

      const hora = this.azar.ponderado([
        [8, 8],
        [9, 10],
        [10, 18],
        [11, 14],
        [12, 10],
        [13, 14],
        [14, 10],
        [15, 9],
        [16, 5],
        [17, 2],
      ] as const);
      let ocurrido = momento(dia, hora, this.azar.entero(0, 59));
      if (ocurrido > MOMENTO_CORTE - 60) ocurrido = momento(dia, 9, 0);

      // 65 % lo reporta un profesor del curso y el resto Convivencia.
      const reportaProfesor = this.azar.probabilidad(0.65);
      const reportadoPor = reportaProfesor
        ? this.azar.probabilidad(0.6)
          ? curso.jefe
          : this.azar.elegir(curso.profesores)
        : this.azar.ponderado(
            this.convivencia.map((m, i) => [m, [50, 30, 20][i]] as const),
          );
      const tramo = this.azar.ponderado([
        [0, 50],
        [1, 30],
        [2, 15],
        [3, 5],
      ] as const);
      const demora = [
        this.azar.entero(5, 120),
        this.azar.entero(121, 600),
        this.azar.entero(minutosDias(1), minutosDias(3)),
        this.azar.entero(minutosDias(3), minutosDias(10)),
      ][tramo];
      let reportado = Math.min(ocurrido + demora, MOMENTO_CORTE - 5);
      // La asignación del profesor termina con el año escolar.
      if (reportaProfesor && anio.estado === 'CERRADO')
        reportado = Math.min(reportado, momento(anio.fin, 23, 0));
      reportado = Math.max(reportado, ocurrido + 5);

      let tipoOrigen = 'PROFESOR';
      let personaOrigen: string | null = null;
      if (!reportaProfesor) {
        tipoOrigen = this.azar.ponderado([
          ['ESTUDIANTE', 30],
          ['FUNCIONARIO', 25],
          ['PROFESOR', 20],
          ['OTRO', 25],
        ] as const);
        personaOrigen =
          tipoOrigen === 'ESTUDIANTE'
            ? this.azar.elegir(presentes).estudiante.personaId
            : tipoOrigen === 'PROFESOR'
              ? curso.jefe.personaId
              : tipoOrigen === 'FUNCIONARIO'
                ? this.admin.personaId
                : null;
      }
      const { categoria, id: categoriaId } = this.azar.ponderado(
        this.categorias.map((c) => [c, c.categoria.peso] as const),
      );
      const urgencia = this.azar.ponderado([
        ['NORMAL', categoria.urgencia[0]],
        ['URGENTE', categoria.urgencia[1]],
        ['INMEDIATA', categoria.urgencia[2]],
      ] as const);
      const lugar =
        categoria.nombre === 'Ciberacoso' && this.azar.probabilidad(0.8)
          ? 'Redes sociales'
          : this.azar.ponderado(LUGARES);

      const id = this.azar.uuid();
      const fila: Fila = {
        id,
        codigo: null,
        reportado_por_membresia_id: reportadoPor.membresiaId,
        curso_contexto_id:
          reportaProfesor || this.azar.probabilidad(0.7) ? curso.id : null,
        tipo_origen: tipoOrigen,
        persona_origen_id: personaOrigen,
        ocurrido_en: textoMomento(ocurrido),
        reportado_en: textoMomento(reportado),
        lugar,
        descripcion: this.azar.elegir(categoria.relatos),
        categoria_id: categoriaId,
        estado: 'NUEVA',
        caso_id: null,
        vinculado_a_caso_en: null,
        vinculado_a_caso_por: null,
        asignado_a_membresia_id: null,
        urgencia,
        registro_historico: false,
      };
      this.situaciones.push({
        id,
        curso,
        reportadoPor,
        ocurrido,
        reportado,
        categoria,
        categoriaId,
        participantes,
        fila,
        ultimaRevision: null,
      });
      for (const p of participantes)
        this.agregar('participaciones', {
          id: this.azar.uuid(),
          persona_id: p.personaId,
          situacion_id: id,
          caso_id: null,
          rol_contextual: p.rol,
          activo_desde: textoMomento(reportado),
          matricula_contexto_id: p.matriculaId,
        });
    }
  }

  /** Código correlativo por año, en el orden en que se registraron. */
  private asignarCodigos(
    registros: { fila: Fila; momento: number }[],
    prefijo: string,
  ) {
    const ordenados = [...registros].sort(
      (a, b) =>
        a.momento - b.momento ||
        String(a.fila.id).localeCompare(String(b.fila.id)),
    );
    const contadores = new Map<number, number>();
    for (const { fila, momento: m } of ordenados) {
      const anio = anioDe(diaDeMomento(m));
      const siguiente = (contadores.get(anio) ?? 0) + 1;
      contadores.set(anio, siguiente);
      fila.codigo = `${prefijo}-${anio}-${String(siguiente).padStart(5, '0')}`;
    }
  }

  private revisar(
    situacion: Situacion,
    resultado: string,
    en: number,
    por: Miembro,
    fundamento: string,
    casoDestino: string | null,
  ) {
    const id = this.azar.uuid();
    this.agregar('revisiones_convivencia', {
      id,
      situacion_id: situacion.id,
      caso_id: null,
      caso_destino_id: casoDestino,
      tipo_revision: 'DECISION',
      resultado,
      fundamento,
      modo_revision: 'MANUAL',
      revisado_por: por.membresiaId,
      revisado_en: textoMomento(en),
      revision_anterior_id: situacion.ultimaRevision,
    });
    situacion.ultimaRevision = id;
    situacion.fila.estado = resultado;
  }

  /**
   * Revisión de cada situación: Convivencia la toma, a veces pide una
   * aclaración al profesor y después decide (antecedente, descarte o caso).
   * Lo que todavía no ocurre a la fecha de corte queda pendiente.
   */
  private decidir() {
    const decisiones: {
      situacion: Situacion;
      en: number;
      responsable: Miembro;
    }[] = [];
    for (const situacion of this.situaciones) {
      const fila = situacion.fila;
      const rapidez =
        fila.urgencia === 'INMEDIATA'
          ? 0.15
          : fila.urgencia === 'URGENTE'
            ? 0.4
            : 1;
      const inicio = enHorario(
        this.azar,
        situacion.reportado +
          Math.round(rapidez * this.azar.entero(30, minutosDias(4))),
      );
      if (inicio > MOMENTO_CORTE) continue;
      const responsable = this.azar.ponderado(
        this.convivencia.map((m, i) => [m, [50, 30, 20][i]] as const),
      );
      fila.estado = 'EN_REVISION';
      fila.asignado_a_membresia_id = responsable.membresiaId;
      let desde = inicio;

      if (
        situacion.reportadoPor.perfil === 'PROFESOR' &&
        this.azar.probabilidad(0.12)
      ) {
        const pide = enHorario(
          this.azar,
          desde + this.azar.entero(60, minutosDias(2)),
        );
        if (pide > MOMENTO_CORTE) continue;
        this.revisar(
          situacion,
          'INFORMACION_SOLICITADA',
          pide,
          responsable,
          this.azar.elegir(FUNDAMENTOS.INFORMACION_SOLICITADA),
          null,
        );
        const responde = enHorario(
          this.azar,
          pide + this.azar.entero(120, minutosDias(5)),
        );
        const respondida = responde <= MOMENTO_CORTE;
        this.agregar('aclaraciones_situacion', {
          id: this.azar.uuid(),
          situacion_id: situacion.id,
          solicitado_por: responsable.membresiaId,
          profesor_destinatario_id: situacion.reportadoPor.membresiaId,
          pregunta: this.azar.elegir(PREGUNTAS),
          solicitado_en: textoMomento(pide),
          respuesta: respondida ? this.azar.elegir(RESPUESTAS) : null,
          respondido_por: respondida
            ? situacion.reportadoPor.membresiaId
            : null,
          respondido_en: respondida ? textoMomento(responde) : null,
          estado: respondida ? 'RESPONDIDA' : 'PENDIENTE',
        });
        if (!respondida) continue;
        // Con la respuesta, la situación vuelve a quedar En revisión.
        fila.estado = 'EN_REVISION';
        desde = responde;
      }

      const decide = enHorario(
        this.azar,
        desde + Math.round(rapidez * this.azar.entero(120, minutosDias(15))),
      );
      if (decide > MOMENTO_CORTE) continue;
      decisiones.push({ situacion, en: decide, responsable });
    }

    // Las decisiones se toman en orden, así un caso solo recibe situaciones
    // mientras sigue abierto.
    decisiones.sort(
      (a, b) => a.en - b.en || a.situacion.id.localeCompare(b.situacion.id),
    );
    for (const { situacion, en, responsable } of decisiones) {
      const resultado = this.azar.ponderado([
        ['ANTECEDENTE', 48],
        ['DESCARTADA', 20],
        ['VINCULADA_CASO', 32],
      ] as const);
      if (resultado !== 'VINCULADA_CASO') {
        this.revisar(
          situacion,
          resultado,
          en,
          responsable,
          this.azar.elegir(FUNDAMENTOS[resultado]),
          null,
        );
        continue;
      }
      const abiertos = this.casosAbiertos(situacion, en);
      let caso: Caso;
      let fundamento: string;
      if (abiertos.length > 0 && this.azar.probabilidad(0.6)) {
        caso = abiertos[0];
        fundamento = `Se vincula al caso «${String(caso.fila.titulo)}» porque involucra a los mismos estudiantes.`;
        this.sumarAlCaso(caso, situacion, en);
      } else {
        caso = this.abrirCaso(situacion, en, responsable, abiertos.length > 0);
        fundamento = `Se abre un caso a partir de esta situación: ${String(caso.fila.titulo)}`;
      }
      this.revisar(
        situacion,
        'VINCULADA_CASO',
        en + 1,
        responsable,
        fundamento,
        caso.id,
      );
      situacion.fila.caso_id = caso.id;
      situacion.fila.vinculado_a_caso_en = textoMomento(en + 1);
      situacion.fila.vinculado_a_caso_por = responsable.membresiaId;
    }
  }

  private estadoEn(caso: Caso, en: number): string {
    let estado = 'EN_ANALISIS';
    for (const t of caso.transiciones) if (t.en <= en) estado = t.nuevo;
    return estado;
  }

  /** Casos abiertos en ese momento que comparten un estudiante, el más reciente primero. */
  private casosAbiertos(situacion: Situacion, en: number): Caso[] {
    const encontrados = new Set<Caso>();
    for (const p of situacion.participantes)
      for (const caso of this.casosDePersona.get(p.personaId) ?? [])
        if (caso.registrado < en && this.estadoEn(caso, en) !== 'CERRADO')
          encontrados.add(caso);
    return [...encontrados].sort((a, b) => b.registrado - a.registrado);
  }

  private sumarPersona(caso: Caso, participante: Participante, en: number) {
    if (caso.personas.has(participante.personaId)) return;
    caso.personas.add(participante.personaId);
    const lista = this.casosDePersona.get(participante.personaId) ?? [];
    lista.push(caso);
    this.casosDePersona.set(participante.personaId, lista);
    this.agregar('participaciones', {
      id: this.azar.uuid(),
      persona_id: participante.personaId,
      situacion_id: null,
      caso_id: caso.id,
      rol_contextual: participante.rol,
      activo_desde: textoMomento(en),
      matricula_contexto_id: participante.matriculaId,
    });
  }

  /** Quienes participan en la situación y no estaban en el caso pasan a él (PB-052). */
  private sumarAlCaso(caso: Caso, situacion: Situacion, en: number) {
    for (const p of situacion.participantes) this.sumarPersona(caso, p, en + 1);
  }

  private abrirCaso(
    situacion: Situacion,
    en: number,
    responsable: Miembro,
    independiente: boolean,
  ): Caso {
    const inicio = diaDeMomento(en);
    const id = this.azar.uuid();
    const fila: Fila = {
      id,
      codigo: null,
      resumen: `Caso abierto a partir de una situación de ${situacion.categoria.nombre.toLowerCase()} en ${situacion.curso.nombre}: ${String(situacion.fila.descripcion)}`,
      categoria_principal_id: situacion.categoriaId,
      asignado_a_membresia_id: responsable.membresiaId,
      abierto_por: responsable.membresiaId,
      abierto_en: textoMomento(en),
      estado_actual: 'EN_ANALISIS',
      cerrado_en: null,
      titulo: `${situacion.categoria.nombre} en ${situacion.curso.nombre}`,
      fecha_inicio: textoDia(inicio),
      registrado_en: textoMomento(en),
      registro_historico: false,
      justificacion_independiente: independiente
        ? 'Los hechos son distintos a los del caso abierto y requieren un seguimiento propio.'
        : null,
      plazo_cierre_dias_aplicado: PLAZO_CIERRE_DIAS,
      fecha_limite_cierre: textoDia(inicio + PLAZO_CIERRE_DIAS),
    };
    const caso: Caso = {
      id,
      registrado: en,
      responsable,
      transiciones: this.trayectoria(en),
      personas: new Set(),
      fila,
    };
    this.casos.push(caso);
    for (const p of situacion.participantes) this.sumarPersona(caso, p, en);
    return caso;
  }

  /** Estados por los que pasa el caso hasta la fecha de corte (HU-131). */
  private trayectoria(desde: number): Transicion[] {
    const siguiente: Record<string, readonly (readonly [string, number])[]> = {
      EN_ANALISIS: [
        ['EN_INTERVENCION', 65],
        ['EN_SEGUIMIENTO', 15],
        ['EN_REVISION', 8],
        ['CERRADO', 12],
      ],
      EN_REVISION: [
        ['EN_INTERVENCION', 70],
        ['EN_SEGUIMIENTO', 15],
        ['CERRADO', 15],
      ],
      EN_INTERVENCION: [
        ['EN_SEGUIMIENTO', 70],
        ['EN_REVISION', 10],
        ['CERRADO', 20],
      ],
      EN_SEGUIMIENTO: [
        ['CERRADO', 75],
        ['EN_INTERVENCION', 15],
        ['EN_REVISION', 10],
      ],
      REABIERTO: [
        ['EN_INTERVENCION', 60],
        ['EN_REVISION', 40],
      ],
    };
    const duracion: Record<string, [number, number]> = {
      EN_ANALISIS: [1, 10],
      EN_REVISION: [3, 20],
      EN_INTERVENCION: [10, 45],
      EN_SEGUIMIENTO: [10, 60],
      REABIERTO: [1, 7],
    };
    const transiciones: Transicion[] = [];
    let estado = 'EN_ANALISIS';
    let en = desde;
    for (let paso = 0; paso < 14; paso++) {
      let nuevo: string;
      if (estado === 'CERRADO') {
        if (!this.azar.probabilidad(0.07)) break;
        nuevo = 'REABIERTO';
        en += minutosDias(this.azar.entero(15, 120));
      } else {
        const [minimo, maximo] = duracion[estado];
        en += minutosDias(this.azar.entero(minimo, maximo));
        nuevo = this.azar.ponderado(siguiente[estado]);
      }
      en = enHorario(this.azar, en);
      if (en > MOMENTO_CORTE) break;
      transiciones.push({ anterior: estado, nuevo, en });
      estado = nuevo;
    }
    return transiciones;
  }

  /** Historial de estados y estado final de cada caso. */
  private completarCasos() {
    for (const caso of this.casos) {
      for (const t of caso.transiciones) {
        const quien = this.azar.probabilidad(0.8)
          ? caso.responsable
          : this.azar.elegir(this.convivencia);
        this.agregar('historial_estados_caso', {
          id: this.azar.uuid(),
          caso_id: caso.id,
          estado_anterior: t.anterior,
          estado_nuevo: t.nuevo,
          cambiado_por: quien.membresiaId,
          cambiado_en: textoMomento(t.en),
          motivo: MOTIVOS_CAMBIO[t.nuevo as keyof typeof MOTIVOS_CAMBIO],
          resumen_cierre:
            t.nuevo === 'CERRADO' ? this.azar.elegir(RESUMENES_CIERRE) : null,
          evidencia_cierre_id: null,
          justificacion_pendientes: null,
        });
      }
      const ultima = caso.transiciones.at(-1);
      caso.fila.estado_actual = ultima?.nuevo ?? 'EN_ANALISIS';
      caso.fila.cerrado_en =
        ultima?.nuevo === 'CERRADO' ? textoMomento(ultima.en) : null;
      this.agregar('casos', caso.fila);
    }
    for (const s of this.situaciones) this.agregar('situaciones', s.fila);
  }
}

function contar(filas: Fila[], campo: string): Record<string, number> {
  const conteo: Record<string, number> = {};
  for (const fila of filas) {
    const clave = String(fila[campo]);
    conteo[clave] = (conteo[clave] ?? 0) + 1;
  }
  return conteo;
}

/** Arma los datos de las dos escuelas sintéticas de esta semilla. */
export function generarPlan(opciones: OpcionesPlan): Plan {
  if (!SEMILLA_VALIDA.test(opciones.semilla))
    throw new Error('La semilla usa de 1 a 20 letras, números o guiones.');
  if (!Number.isInteger(opciones.situaciones) || opciones.situaciones < 2)
    throw new Error(
      'La cantidad de situaciones debe ser un entero mayor que 1.',
    );
  const azar = new Azar(`convi-sinteticos:${opciones.semilla}`);
  const tablas = Object.fromEntries(
    TABLAS.map((t) => [t, []]),
  ) as unknown as Record<Tabla, Fila[]>;
  const cuentas: CuentaPlan[] = [];
  const ruts = new Set<number>();
  const escuelas: EscuelaPlan[] = [];
  ESCUELAS.forEach((definicion, i) => {
    const generador = new GeneradorEscuela(
      azar,
      definicion,
      opciones.semilla,
      tablas,
      cuentas,
      ruts,
    );
    escuelas.push(generador.escuela);
    const parte = Math.floor(opciones.situaciones / ESCUELAS.length);
    generador.generar(i === 0 ? opciones.situaciones - parte : parte);
  });

  const situaciones = tablas.situaciones;
  return {
    semilla: opciones.semilla,
    fecha_corte: FECHA_CORTE,
    escuelas,
    tablas,
    cuentas,
    resumen: {
      escuelas: escuelas.length,
      estudiantes: tablas.estudiantes.length,
      estudiantes_activos: tablas.estudiantes.filter(
        (e) => e.estado === 'ACTIVO',
      ).length,
      matriculas: tablas.matriculas.length,
      personal: tablas.membresias_establecimiento.length,
      cursos: tablas.cursos.length,
      situaciones: situaciones.length,
      participaciones: tablas.participaciones.length,
      decisiones: tablas.revisiones_convivencia.length,
      aclaraciones: tablas.aclaraciones_situacion.length,
      casos: tablas.casos.length,
      cambios_de_estado: tablas.historial_estados_caso.length,
      situaciones_por_anio: contar(
        situaciones.map((s) => ({ anio: String(s.ocurrido_en).slice(0, 4) })),
        'anio',
      ),
      situaciones_por_estado: contar(situaciones, 'estado'),
      casos_por_estado: contar(tablas.casos, 'estado_actual'),
    },
  };
}
