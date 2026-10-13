// Opciones y límites del formulario de la escuela (PB-002). Los largos son los
// de convi.establecimientos; la API vuelve a validar todo.
export const LARGO_MAXIMO_ESCUELA = {
  nombre: 180,
  codigo: 40,
  comuna: 100,
  direccion: 200,
  telefono_escuela: 40,
  correo_contacto: 180,
} as const;

export const REGIONES = [
  "Arica y Parinacota",
  "Tarapacá",
  "Antofagasta",
  "Atacama",
  "Coquimbo",
  "Valparaíso",
  "Metropolitana de Santiago",
  "Libertador General Bernardo O'Higgins",
  "Maule",
  "Ñuble",
  "Biobío",
  "La Araucanía",
  "Los Ríos",
  "Los Lagos",
  "Aysén del General Carlos Ibáñez del Campo",
  "Magallanes y de la Antártica Chilena",
] as const;

// Zonas horarias de Chile. Si no se elige, el modelo usa America/Santiago (HU-002 CA2).
export const ZONAS_HORARIAS = [
  { valor: "America/Santiago", texto: "Chile continental" },
  { valor: "America/Punta_Arenas", texto: "Región de Magallanes" },
  { valor: "Pacific/Easter", texto: "Isla de Pascua" },
] as const;