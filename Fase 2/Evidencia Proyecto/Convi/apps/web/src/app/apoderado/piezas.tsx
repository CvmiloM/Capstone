import type { ReactNode } from "react";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { AvisoError } from "@/app/components/formulario";
import { Icono, type NombreIcono } from "@/app/components/icono";

// Piezas compartidas del portal del apoderado: solo usan los colores de
// globals.css y las fechas siempre en la zona horaria de la escuela.

export const rutaPupilo = (id: string, parte = "") => `/apoderado/estudiantes/${id}${parte ? `/${parte}` : ""}`;
/** Descarga protegida de un archivo de un caso o de una situación, la vista previa agrega /vista. */
export const rutaArchivoCaso = (id: string, casoId: string, archivoId: string) => rutaPupilo(id, `casos/${casoId}/evidencias/${archivoId}`);
export const rutaArchivoSituacion = (id: string, situacionId: string, archivoId: string) => rutaPupilo(id, `situaciones/${situacionId}/evidencias/${archivoId}`);
/** Solo las imágenes se abren en el navegador, igual que en la API, los PDF se descargan. */
export const tieneVistaPrevia = (mime: string) => ["image/jpeg", "image/png", "image/webp"].includes(mime);

function formato(opciones: Intl.DateTimeFormatOptions) {
  return (valor: string, zona: string) => new Intl.DateTimeFormat("es-CL", { timeZone: zona, ...opciones }).format(new Date(valor));
}
/** 17 sept 2026 */
export const fechaCorta = formato({ day: "numeric", month: "short", year: "numeric" });
/** 17 de septiembre de 2026 */
export const fechaLarga = formato({ day: "numeric", month: "long", year: "numeric" });
/** 11:30 */
export const hora = formato({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Fechas sin hora de la base (2026-09-17), que no dependen de la zona horaria. */
export const diaCorto = (dia: string) => fechaCorta(`${dia}T12:00:00Z`, "UTC");
export const diaLargo = (dia: string) => fechaLarga(`${dia}T12:00:00Z`, "UTC");
/** Jueves, 17 de septiembre de 2026 */
export function diaConSemana(dia: string) {
  const texto = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${dia}T12:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export const TIPOS_ENCUENTRO: Record<string, string> = { ENTREVISTA: "Entrevista", REUNION: "Reunión", MEDIACION: "Mediación", SEGUIMIENTO: "Seguimiento", INTERVENCION: "Intervención", ACOMPANAMIENTO: "Acompañamiento" };
export const TIPOS_COMUNICACION: Record<string, string> = { CORREO: "Correo", LLAMADA: "Llamada", PRESENCIAL: "Conversación presencial", INSTITUCIONAL: "Comunicación institucional", OTRO: "Comunicación" };
export const ESTADOS_CASO: Record<string, string> = { EN_ANALISIS: "En análisis", EN_REVISION: "En revisión", EN_INTERVENCION: "En intervención", EN_SEGUIMIENTO: "En seguimiento", CERRADO: "Cerrado", REABIERTO: "Reabierto" };
export const ESTADOS_SITUACION: Record<string, string> = { NUEVA: "Recibida", EN_REVISION: "En revisión", INFORMACION_SOLICITADA: "En revisión", ANTECEDENTE: "Registrada como antecedente", VINCULADA_CASO: "Parte de un caso" };
export const ESTADOS_COMPROMISO: Record<string, string> = { PENDIENTE: "Pendiente", EN_PROGRESO: "En progreso", COMPLETADO: "Cumplido", VENCIDO: "Vencido", CANCELADO: "Cancelado" };
export const ESTADOS_COMUNICACION: Record<string, string> = { NO_APLICA: "Registrada", ENVIADO: "Enviada", ENTREGADO: "Entregada" };
export const MATRICULAS: Record<string, string> = { ACTIVO: "Matrícula activa", TRASLADADO: "Trasladado", COMPLETADO: "Año completado", RETIRADO: "Retirado" };

/** Círculo con las iniciales del pupilo. */
export function Iniciales({ texto, grande = false }: { texto: string; grande?: boolean }) {
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-accent font-titulo font-semibold text-primary ring-1 ring-primary/10 ${grande ? "size-16 text-xl" : "size-12 text-base"}`}>
      {texto}
    </span>
  );
}

/** Insignia pequeña: matrícula activa en verde, lo demás en gris. */
export function Matricula({ estado }: { estado: string | null }) {
  const activa = estado === "ACTIVO";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${activa ? "bg-verde/10 text-verde" : "bg-muted text-muted-foreground"}`}>
      {estado ? (MATRICULAS[estado] ?? estado) : "Sin matrícula registrada"}
    </span>
  );
}

/** Aviso de que el portal solo permite consultar. */
export function SoloLectura({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-primary/15 bg-accent px-4 py-3 text-sm text-accent-foreground">
      <Icono nombre="ojo" className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 basis-56">{children}</p>
      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider">Solo lectura</span>
    </div>
  );
}

/** Título de cada pantalla del pupilo. */
export function TituloPantalla({ titulo, descripcion }: { titulo: string; descripcion?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-semibold text-foreground">{titulo}</h1>
      {descripcion && <p className="mt-1.5 text-sm text-muted-foreground">{descripcion}</p>}
    </div>
  );
}

/** Lista sin registros, con un texto que explica qué aparecerá ahí. */
export function SinRegistros({ icono, titulo, texto }: { icono: NombreIcono; titulo: string; texto: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icono nombre={icono} className="size-6" />
      </span>
      <h2 className="mt-4 font-semibold">{titulo}</h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

/** 1 caso activo, 3 casos activos */
export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Estado de un caso: los cerrados en gris, los demás en azul. */
export function EstadoCaso({ valor }: { valor: string }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${valor === "CERRADO" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
      {ESTADOS_CASO[valor] ?? valor.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}

export function SinAcceso() {
  return <AvisoError>No tienes acceso disponible a este pupilo, pide al administrador de la escuela que revise tu permiso</AvisoError>;
}

/** Estado de una situación: las que siguen en revisión en azul, las demás en gris. */
export function EstadoSituacion({ valor }: { valor: string }) {
  const revision = ["NUEVA", "EN_REVISION", "INFORMACION_SOLICITADA"].includes(valor);
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${revision ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
      {ESTADOS_SITUACION[valor] ?? valor.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}

/** Enlace a un caso del pupilo, en el texto de apoyo de una tarjeta. */
export function EnlaceCaso({ id, casoId, codigo }: { id: string; casoId: string; codigo: string }) {
  return (
    <Link href={rutaPupilo(id, `casos/${casoId}`)} prefetch={false} className="font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {codigo}
    </Link>
  );
}

/** Enlace a una situación del pupilo, con su relato y sus imágenes. */
export function EnlaceSituacion({ id, situacionId }: { id: string; situacionId: string }) {
  return (
    <Link href={rutaPupilo(id, `situaciones/${situacionId}`)} prefetch={false} className="font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      Ver la situación
    </Link>
  );
}

/** Botón para descargar un archivo con la descarga protegida de su caso o su situación. */
export function Descargar({ href: ruta, titulo, compacto = false }: { href: string; titulo: string; compacto?: boolean }) {
  if (compacto)
    return (
      <a href={ruta} className="presion inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-primary/15 bg-accent px-3 py-1 text-xs font-medium text-accent-foreground hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <Icono nombre="documentos" className="size-3.5 shrink-0" />
        <span className="truncate">{titulo}</span>
        <span className="sr-only">, descargar</span>
      </a>
    );
  return (
    <a href={ruta} aria-label={`Descargar ${titulo}`} className="presion inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-input bg-card px-3.5 py-2 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <Icono nombre="descargar" className="size-4" />
      Descargar
    </a>
  );
}
