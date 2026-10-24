// PB-159: nombres, categorías y textos ficticios del generador. Ningún dato
// viene de personas o escuelas reales.

export const NOMBRES = [
  'Agustín',
  'Alonso',
  'Amanda',
  'Antonella',
  'Antonia',
  'Benjamín',
  'Bastián',
  'Catalina',
  'Clemente',
  'Constanza',
  'Cristóbal',
  'Daniela',
  'Diego',
  'Emilia',
  'Emilio',
  'Fernanda',
  'Florencia',
  'Francisca',
  'Gabriel',
  'Gaspar',
  'Ignacia',
  'Isidora',
  'Javiera',
  'Joaquín',
  'Josefa',
  'Julieta',
  'Lucas',
  'Lucía',
  'Magdalena',
  'Martín',
  'Martina',
  'Matías',
  'Maximiliano',
  'Mateo',
  'Monserrat',
  'Nicolás',
  'Pascal',
  'Pía',
  'Renata',
  'Sofía',
  'Tomás',
  'Trinidad',
  'Valentina',
  'Vicente',
  'Simón',
  'Rafaela',
  'Felipe',
  'Laura',
  'Bruno',
  'Elena',
  'Ian',
  'Mía',
  'Leonor',
  'Facundo',
  'Colomba',
  'Damián',
  'Aurora',
  'Thiago',
  'Belén',
  'Alfonso',
] as const;

export const APELLIDOS = [
  'Acuña',
  'Aguilera',
  'Alarcón',
  'Araya',
  'Bravo',
  'Cáceres',
  'Campos',
  'Cárdenas',
  'Carrasco',
  'Castillo',
  'Castro',
  'Contreras',
  'Cortés',
  'Díaz',
  'Espinoza',
  'Figueroa',
  'Flores',
  'Fuentes',
  'Gallardo',
  'Gómez',
  'González',
  'Gutiérrez',
  'Henríquez',
  'Herrera',
  'Jara',
  'Lagos',
  'López',
  'Martínez',
  'Medina',
  'Méndez',
  'Molina',
  'Morales',
  'Muñoz',
  'Navarro',
  'Núñez',
  'Olivares',
  'Orellana',
  'Pérez',
  'Pizarro',
  'Quiroz',
  'Ramírez',
  'Reyes',
  'Riquelme',
  'Rivera',
  'Rojas',
  'Saavedra',
  'Salazar',
  'Sánchez',
  'Sepúlveda',
  'Silva',
  'Soto',
  'Tapia',
  'Torres',
  'Valdés',
  'Valenzuela',
  'Vargas',
  'Vega',
  'Vergara',
  'Yáñez',
  'Zúñiga',
] as const;

export type NivelPlan = {
  codigo: string;
  nombre: string;
  orden: number;
  ciclo: 'BASICA' | 'MEDIA';
  tramo: string;
  /** Peso relativo de situaciones en el nivel (más en 6° básico a II medio). */
  peso: number;
};

export const NIVELES: readonly NivelPlan[] = [
  {
    codigo: 'B1',
    nombre: '1° básico',
    orden: 1,
    ciclo: 'BASICA',
    tramo: 'PRIMER_CICLO',
    peso: 0.6,
  },
  {
    codigo: 'B2',
    nombre: '2° básico',
    orden: 2,
    ciclo: 'BASICA',
    tramo: 'PRIMER_CICLO',
    peso: 0.6,
  },
  {
    codigo: 'B3',
    nombre: '3° básico',
    orden: 3,
    ciclo: 'BASICA',
    tramo: 'PRIMER_CICLO',
    peso: 0.7,
  },
  {
    codigo: 'B4',
    nombre: '4° básico',
    orden: 4,
    ciclo: 'BASICA',
    tramo: 'PRIMER_CICLO',
    peso: 0.8,
  },
  {
    codigo: 'B5',
    nombre: '5° básico',
    orden: 5,
    ciclo: 'BASICA',
    tramo: 'SEGUNDO_CICLO',
    peso: 1.0,
  },
  {
    codigo: 'B6',
    nombre: '6° básico',
    orden: 6,
    ciclo: 'BASICA',
    tramo: 'SEGUNDO_CICLO',
    peso: 1.3,
  },
  {
    codigo: 'B7',
    nombre: '7° básico',
    orden: 7,
    ciclo: 'BASICA',
    tramo: 'SEGUNDO_CICLO',
    peso: 1.5,
  },
  {
    codigo: 'B8',
    nombre: '8° básico',
    orden: 8,
    ciclo: 'BASICA',
    tramo: 'SEGUNDO_CICLO',
    peso: 1.5,
  },
  {
    codigo: 'M1',
    nombre: 'I medio',
    orden: 9,
    ciclo: 'MEDIA',
    tramo: 'FORMACION_GENERAL',
    peso: 1.4,
  },
  {
    codigo: 'M2',
    nombre: 'II medio',
    orden: 10,
    ciclo: 'MEDIA',
    tramo: 'FORMACION_GENERAL',
    peso: 1.2,
  },
  {
    codigo: 'M3',
    nombre: 'III medio',
    orden: 11,
    ciclo: 'MEDIA',
    tramo: 'FORMACION_DIFERENCIADA',
    peso: 0.9,
  },
  {
    codigo: 'M4',
    nombre: 'IV medio',
    orden: 12,
    ciclo: 'MEDIA',
    tramo: 'FORMACION_DIFERENCIADA',
    peso: 0.7,
  },
];

export const SECCIONES = ['A', 'B'] as const;

export type CategoriaPlan = {
  nombre: string;
  descripcion: string;
  peso: number;
  /** Pesos de NORMAL, URGENTE e INMEDIATA. */
  urgencia: readonly [number, number, number];
  /** Frases para la descripción de la situación. */
  relatos: readonly string[];
};

export const CATEGORIAS: readonly CategoriaPlan[] = [
  {
    nombre: 'Conflicto entre pares',
    descripcion: 'Discusiones o roces entre estudiantes sin agresión física.',
    peso: 26,
    urgencia: [90, 9, 1],
    relatos: [
      'Discusión entre estudiantes por un juego que terminó en insultos y llanto.',
      'Dos estudiantes discuten de forma reiterada durante la clase y se interrumpe la actividad.',
      'Un grupo excluye a un compañero del trabajo en equipo y se produce una discusión.',
    ],
  },
  {
    nombre: 'Agresión verbal',
    descripcion: 'Insultos, amenazas o burlas dirigidas a otra persona.',
    peso: 18,
    urgencia: [80, 17, 3],
    relatos: [
      'Un estudiante insulta y se burla de un compañero frente al curso.',
      'Se reportan amenazas verbales entre estudiantes a la salida de la sala.',
      'Burlas repetidas por el aspecto físico de un estudiante durante el recreo.',
    ],
  },
  {
    nombre: 'Agresión física',
    descripcion: 'Golpes, empujones u otra agresión que afecta el cuerpo.',
    peso: 12,
    urgencia: [45, 40, 15],
    relatos: [
      'Pelea con golpes entre estudiantes en el patio, separada por un inspector.',
      'Un estudiante empuja a un compañero, que cae y se golpea el brazo.',
      'Agresión física durante el recreo que deja a un estudiante con una lesión leve.',
    ],
  },
  {
    nombre: 'Ciberacoso',
    descripcion: 'Hostigamiento por redes sociales, mensajería o internet.',
    peso: 9,
    urgencia: [55, 35, 10],
    relatos: [
      'Circulan en un grupo de mensajería imágenes de un estudiante sin su consentimiento.',
      'Un estudiante recibe mensajes ofensivos repetidos por redes sociales.',
      'Se crea una cuenta falsa para burlarse de una estudiante del curso.',
    ],
  },
  {
    nombre: 'Discriminación',
    descripcion: 'Trato distinto o exclusión por características personales.',
    peso: 6,
    urgencia: [70, 25, 5],
    relatos: [
      'Comentarios discriminatorios hacia un estudiante por su origen.',
      'Un grupo se niega a trabajar con un compañero por su apariencia.',
    ],
  },
  {
    nombre: 'Daño a la propiedad',
    descripcion: 'Daño a bienes del establecimiento o de otras personas.',
    peso: 10,
    urgencia: [85, 13, 2],
    relatos: [
      'Rayado de mesas y paredes de la sala durante el cambio de hora.',
      'Se rompe la mochila de un estudiante durante un juego brusco.',
      'Daño a un computador de la biblioteca.',
    ],
  },
  {
    nombre: 'Consumo de sustancias',
    descripcion: 'Consumo o porte de alcohol, tabaco u otras drogas.',
    peso: 5,
    urgencia: [40, 45, 15],
    relatos: [
      'Se sorprende a estudiantes fumando en el baño.',
      'Un estudiante llega a clases con signos de haber consumido alcohol.',
    ],
  },
  {
    nombre: 'Incumplimiento de normas',
    descripcion: 'Faltas al reglamento interno sin daño a otras personas.',
    peso: 14,
    urgencia: [95, 5, 0],
    relatos: [
      'Uso reiterado del celular en clases pese a las advertencias.',
      'Salida de la sala sin autorización durante la clase.',
      'Atrasos reiterados al inicio de la jornada.',
    ],
  },
];

export const LUGARES = [
  ['Sala de clases', 30],
  ['Patio', 25],
  ['Pasillo', 10],
  ['Baño', 7],
  ['Comedor', 6],
  ['Gimnasio', 7],
  ['Biblioteca', 3],
  ['Entrada del establecimiento', 4],
  ['Redes sociales', 8],
] as const;

export const FUNDAMENTOS = {
  ANTECEDENTE: [
    'Se conversó con los estudiantes y se registra como antecedente.',
    'Hecho puntual resuelto con el profesor jefe, queda como antecedente.',
    'Se aplicó la medida formativa del reglamento y se registra como antecedente.',
  ],
  DESCARTADA: [
    'Revisados los antecedentes, no corresponde a una situación de convivencia.',
    'Se descarta por falta de antecedentes que confirmen lo informado.',
    'Situación duplicada de otro reporte ya revisado.',
  ],
  INFORMACION_SOLICITADA: [
    'Se pide al profesor que indique quiénes presenciaron el hecho.',
    'Se pide al profesor el detalle de lo ocurrido antes de decidir.',
  ],
} as const;

export const PREGUNTAS = [
  '¿Quiénes estaban presentes cuando ocurrió?',
  '¿Había ocurrido algo parecido antes con los mismos estudiantes?',
  '¿Se informó a las familias el mismo día?',
] as const;

export const RESPUESTAS = [
  'Estaban presentes otros dos estudiantes del curso y la asistente de aula.',
  'Es la segunda vez en el mes que ocurre algo parecido.',
  'Se informó a las familias por la agenda el mismo día.',
] as const;

export const MOTIVOS_CAMBIO = {
  EN_REVISION: 'Se revisan nuevamente los antecedentes del caso.',
  EN_INTERVENCION: 'Se inicia el plan de intervención con los estudiantes.',
  EN_SEGUIMIENTO: 'Las acciones se cumplieron y se pasa a seguimiento.',
  CERRADO: 'Se cumplieron los objetivos del plan.',
  REABIERTO: 'Ocurrió un hecho nuevo relacionado con el caso.',
  EN_ANALISIS: 'Se vuelve a analizar el caso.',
} as const;

export const RESUMENES_CIERRE = [
  'Los estudiantes cumplieron los compromisos y no se repitieron los hechos.',
  'Se trabajó con las familias y el curso, la situación se resolvió.',
  'Se completaron las acciones del plan y el seguimiento fue favorable.',
] as const;
