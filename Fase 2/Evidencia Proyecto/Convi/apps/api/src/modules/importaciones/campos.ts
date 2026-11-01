import type { TipoImportacion } from './importacion.js';

// PB-020 (HU-015 CA3): campos de CONVI que puede traer cada tipo de
// importación. Con esta misma lista se arma la plantilla XLSX de cada tipo, se
// sugiere qué columna va con qué campo y se revisa cada fila.

export type Campo = {
  clave: string;
  /** Título de la columna en la plantilla y nombre del campo en la pantalla. */
  titulo: string;
  obligatorio: boolean;
  /** Cómo se escribe el dato, para la plantilla y la pantalla. */
  descripcion: string;
  /** Valor de la fila de ejemplo de la plantilla; las fechas, como AAAA-MM-DD. */
  ejemplo: string;
  /** Otros títulos de columna que se reconocen solos (además del título). */
  alias: string[];
  /** Admite varias columnas (como Apellido paterno y Apellido materno). */
  unir?: boolean;
  /** Se guarda como fecha en la plantilla. */
  fecha?: boolean;
};

/**
 * Cuándo pide el año académico: siempre, solo si se relaciona la columna Curso
 * (estudiantes con su matrícula) o nunca.
 */
export type UsoDelAnio = 'SIEMPRE' | 'CON_CURSO' | 'NUNCA';

const NOMBRES: Campo = {
  clave: 'nombres',
  titulo: 'Nombres',
  obligatorio: true,
  descripcion: 'Uno o más nombres.',
  ejemplo: '',
  alias: ['nombre', 'primer nombre'],
};

const APELLIDOS: Campo = {
  clave: 'apellidos',
  titulo: 'Apellidos',
  obligatorio: true,
  descripcion:
    'Los dos apellidos en una columna. Si vienen en dos columnas, relaciona ambas con Apellidos y se juntan.',
  ejemplo: '',
  alias: ['apellido', 'apellido paterno', 'apellido materno'],
  unir: true,
};

const RUT: Campo = {
  clave: 'rut',
  titulo: 'RUT',
  obligatorio: false,
  descripcion: 'Con o sin puntos, con guion y dígito verificador.',
  ejemplo: '',
  alias: ['run', 'rut dv', 'run dv'],
};

const CORREO: Campo = {
  clave: 'correo',
  titulo: 'Correo',
  obligatorio: false,
  descripcion: 'Un correo, por ejemplo nombre@correo.cl.',
  ejemplo: '',
  alias: ['email', 'e mail', 'correo electronico', 'mail'],
};

const TELEFONO: Campo = {
  clave: 'telefono',
  titulo: 'Teléfono',
  obligatorio: false,
  descripcion: 'Con código de país si quieres, por ejemplo +56 9 1234 5678.',
  ejemplo: '+56 9 1234 5678',
  alias: ['fono', 'celular', 'movil', 'telefono contacto'],
};

const DIRECCION: Campo = {
  clave: 'direccion',
  titulo: 'Dirección',
  obligatorio: false,
  descripcion: 'Calle, número y comuna.',
  ejemplo: '',
  alias: ['domicilio'],
};

const CURSO: Campo = {
  clave: 'curso',
  titulo: 'Curso',
  obligatorio: true,
  descripcion:
    'Código o nombre del curso en CONVI (Administración > Cursos), como 1A o 1° básico A, en el año que elijas al revisar.',
  ejemplo: '1A',
  alias: ['codigo curso', 'curso codigo'],
};

const ESTUDIANTE: Campo = {
  clave: 'estudiante',
  titulo: 'Estudiante',
  obligatorio: true,
  descripcion:
    'Código o RUT de un estudiante que ya está en CONVI (Administración > Estudiantes).',
  ejemplo: 'EST-0001',
  alias: [
    'codigo estudiante',
    'rut estudiante',
    'run estudiante',
    'alumno',
    'codigo alumno',
    'rut alumno',
    'run alumno',
  ],
};

const FECHA_MATRICULA: Campo = {
  clave: 'fecha_matricula',
  titulo: 'Fecha de matrícula',
  obligatorio: false,
  descripcion:
    'Día-mes-año. Si viene vacía, se usa la fecha de inicio del año académico.',
  ejemplo: '2026-03-02',
  alias: ['fecha matricula', 'fecha ingreso', 'matriculado desde'],
  fecha: true,
};

export const CAMPOS: Record<TipoImportacion, Campo[]> = {
  ESTUDIANTES: [
    {
      clave: 'codigo_estudiante',
      titulo: 'Código estudiante',
      obligatorio: true,
      descripcion:
        'Código institucional del estudiante: letras, números, guion o guion bajo, sin espacios.',
      ejemplo: 'EST-0001',
      alias: [
        'codigo',
        'codigo alumno',
        'codigo institucional',
        'id estudiante',
      ],
    },
    { ...NOMBRES, ejemplo: 'Martina Belén' },
    { ...APELLIDOS, ejemplo: 'Rojas Fuentes' },
    {
      ...RUT,
      ejemplo: '21.345.678-4',
      alias: [...RUT.alias, 'rut estudiante', 'run estudiante', 'rut alumno'],
    },
    {
      clave: 'fecha_nacimiento',
      titulo: 'Fecha de nacimiento',
      obligatorio: false,
      descripcion: 'Día-mes-año, por ejemplo 15-04-2016.',
      ejemplo: '2016-04-15',
      alias: ['fecha nacimiento', 'nacimiento', 'fecha de nac'],
      fecha: true,
    },
    { ...CORREO, ejemplo: '' },
    { ...TELEFONO, ejemplo: '' },
    { ...DIRECCION, ejemplo: 'Av. Los Aromos 123, Maipú' },
    {
      ...CURSO,
      obligatorio: false,
      descripcion:
        'Opcional. Código del curso en CONVI; si viene, al confirmar también se matricula al estudiante en el año que elijas.',
    },
    FECHA_MATRICULA,
  ],
  CURSOS: [
    {
      clave: 'codigo',
      titulo: 'Código curso',
      obligatorio: true,
      descripcion:
        'Código corto del curso, por ejemplo 1A: letras, números, guion o guion bajo, sin espacios.',
      ejemplo: '1A',
      alias: ['codigo', 'curso', 'codigo del curso'],
    },
    {
      clave: 'nombre',
      titulo: 'Nombre del curso',
      obligatorio: true,
      descripcion: 'Como se muestra en CONVI, por ejemplo 1° básico A.',
      ejemplo: '1° básico A',
      alias: ['nombre', 'nombre curso', 'descripcion'],
    },
    {
      clave: 'nivel',
      titulo: 'Nivel',
      obligatorio: true,
      descripcion:
        'Código de un nivel activo en CONVI (Administración > Niveles), por ejemplo B1.',
      ejemplo: 'B1',
      alias: ['codigo nivel', 'nivel educativo'],
    },
    {
      clave: 'seccion',
      titulo: 'Sección',
      obligatorio: false,
      descripcion: 'Letra o nombre de la sección, por ejemplo A.',
      ejemplo: 'A',
      alias: ['letra', 'paralelo'],
    },
  ],
  PROFESORES: [
    { ...NOMBRES, ejemplo: 'Carolina' },
    { ...APELLIDOS, ejemplo: 'Muñoz Díaz' },
    {
      ...CORREO,
      obligatorio: true,
      descripcion:
        'Correo al que llegará la invitación para activar su cuenta. No se repite en la escuela.',
      ejemplo: 'carolina.munoz@colegio.cl',
    },
    { ...RUT, ejemplo: '15.432.198-5' },
    { ...TELEFONO },
  ],
  APODERADOS: [
    ESTUDIANTE,
    { ...NOMBRES, ejemplo: 'Patricia' },
    { ...APELLIDOS, ejemplo: 'Fuentes Lagos' },
    {
      ...RUT,
      ejemplo: '13.579.246-2',
      alias: [...RUT.alias, 'rut apoderado', 'run apoderado'],
    },
    { ...CORREO, ejemplo: 'patricia.fuentes@correo.cl' },
    { ...TELEFONO },
    { ...DIRECCION, ejemplo: 'Av. Los Aromos 123, Maipú' },
    {
      clave: 'parentesco',
      titulo: 'Parentesco',
      obligatorio: false,
      descripcion:
        'Relación con el estudiante, por ejemplo Madre, Padre o Tía.',
      ejemplo: 'Madre',
      alias: ['relacion', 'tipo relacion', 'vinculo'],
    },
    {
      clave: 'principal',
      titulo: 'Apoderado principal',
      obligatorio: false,
      descripcion: 'Sí o No. Si viene vacío, No.',
      ejemplo: 'Sí',
      alias: ['principal', 'es principal', 'apoderado titular', 'titular'],
    },
    {
      clave: 'contactable',
      titulo: 'Puede ser contactado',
      obligatorio: false,
      descripcion: 'Sí o No. Si viene vacío, Sí.',
      ejemplo: 'Sí',
      alias: ['contactable', 'contactar', 'acepta contacto'],
    },
  ],
  MATRICULAS: [ESTUDIANTE, CURSO, FECHA_MATRICULA],
  ASIGNACIONES: [
    {
      clave: 'profesor',
      titulo: 'Profesor',
      obligatorio: true,
      descripcion:
        'Correo o RUT de un profesor que ya está en CONVI (Administración > Usuarios), con su cuenta activa o pendiente.',
      ejemplo: 'carolina.munoz@colegio.cl',
      alias: [
        'correo profesor',
        'rut profesor',
        'run profesor',
        'docente',
        'correo docente',
      ],
    },
    CURSO,
    {
      clave: 'rol',
      titulo: 'Rol',
      obligatorio: true,
      descripcion: 'Profesor jefe o Profesor.',
      ejemplo: 'Profesor jefe',
      alias: ['rol asignacion', 'funcion', 'cargo'],
    },
    {
      clave: 'fecha_inicio',
      titulo: 'Fecha de inicio',
      obligatorio: false,
      descripcion:
        'Día-mes-año. Si viene vacía, se usa la fecha de inicio del año académico.',
      ejemplo: '2026-03-02',
      alias: ['fecha inicio', 'desde', 'inicio'],
      fecha: true,
    },
    {
      clave: 'fecha_fin',
      titulo: 'Fecha de término',
      obligatorio: false,
      descripcion: 'Día-mes-año. Vacía si la asignación sigue vigente.',
      ejemplo: '',
      alias: ['fecha termino', 'fecha fin', 'hasta', 'termino'],
      fecha: true,
    },
  ],
};

export const USO_DEL_ANIO: Record<TipoImportacion, UsoDelAnio> = {
  ESTUDIANTES: 'CON_CURSO',
  CURSOS: 'SIEMPRE',
  PROFESORES: 'NUNCA',
  APODERADOS: 'NUNCA',
  MATRICULAS: 'SIEMPRE',
  ASIGNACIONES: 'SIEMPRE',
};

/** Título sin tildes, mayúsculas ni signos: "Código  Estudiante:" → "codigo estudiante". */
export function claveDeTitulo(titulo: string) {
  return titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Sugiere el campo de cada columna comparando su título con el título y los
 * alias de cada campo. Un campo se sugiere una sola vez, salvo los que admiten
 * varias columnas.
 */
export function sugerirMapeo(tipo: TipoImportacion, columnas: string[]) {
  const mapeo: Record<string, string> = {};
  const usados = new Set<string>();
  for (const columna of columnas) {
    const clave = claveDeTitulo(columna.replace(/ \(\d+\)$/, ''));
    const campo = CAMPOS[tipo].find(
      (c) =>
        (c.unir || !usados.has(c.clave)) &&
        [c.titulo, ...c.alias].some((t) => claveDeTitulo(t) === clave),
    );
    if (!campo) continue;
    mapeo[columna] = campo.clave;
    usados.add(campo.clave);
  }
  return mapeo;
}
