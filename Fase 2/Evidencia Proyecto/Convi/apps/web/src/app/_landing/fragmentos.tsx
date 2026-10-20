import type { ReactNode } from "react";

/*
 * Fragmentos de la interfaz real de Convi para la landing. Copian el aspecto
 * de los portales (tarjetas bg-card, bordes border-border, etiquetas de
 * urgencia y estado) con datos de ejemplo. Llevan data-ui porque son recortes
 * de la aplicación, no partes del diseño de la página.
 */

const URGENCIA = {
  Normal: "bg-muted text-pizarra",
  Urgente: "bg-amarillo/25 text-tinta",
  Inmediata: "bg-destructive/10 text-destructive",
} as const;

function Etiqueta({
  children,
  clase = "bg-accent text-accent-foreground",
}: {
  children: ReactNode;
  clase?: string;
}) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium ${clase}`}
    >
      {children}
    </span>
  );
}

function Marco({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-ui
      className={`overflow-hidden rounded-2xl border border-border bg-card text-sm text-foreground ${className}`}
    >
      {children}
    </div>
  );
}

// Bandeja de situaciones del equipo de Convivencia (PB-044).
const BANDEJA = [
  {
    codigo: "SIT-2026-00041",
    categoria: "Agresión verbal",
    detalle: "7° básico B · Registró P. Rojas · Ocurrió el 14-10-2026 11:20",
    estudiantes: "2 estudiantes",
    urgencia: "Inmediata",
    estado: "Nueva",
  },
  {
    codigo: "SIT-2026-00040",
    categoria: "Conflicto entre pares",
    detalle: "2° medio A · Registró J. Soto · Ocurrió el 13-10-2026 16:05",
    estudiantes: "3 estudiantes",
    urgencia: "Urgente",
    estado: "En revisión",
  },
  {
    codigo: "SIT-2026-00039",
    categoria: "Uso indebido de redes sociales",
    detalle: "1° medio C · Registró M. Fuentes · Ocurrió el 10-10-2026 09:40",
    estudiantes: "1 estudiante",
    urgencia: "Normal",
    estado: "Información solicitada",
    esperando: true,
  },
  {
    codigo: "SIT-2026-00038",
    categoria: "Daño a materiales",
    detalle: "5° básico A · Registró C. Pérez · Ocurrió el 08-10-2026 12:15",
    estudiantes: "1 estudiante",
    urgencia: "Normal",
    estado: "Antecedente",
  },
] as const;

export function BandejaFragmento() {
  return (
    <Marco className="bg-background p-5 sm:p-6">
      <p className="text-lg font-semibold">Bandeja de situaciones</p>
      <p className="mt-1 text-muted-foreground">
        La más urgente primero. Cada situación muestra su urgencia y su estado.
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {[
          ["Todas", "23", true],
          ["Nueva", "6", false],
          ["En revisión", "9", false],
          ["Información solicitada", "3", false],
          ["Antecedente", "5", false],
        ].map(([texto, total, activo]) => (
          <span
            key={texto as string}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${
              activo
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground"
            }`}
          >
            {texto} <span className="tabular-nums opacity-70">{total}</span>
          </span>
        ))}
      </div>
      <ul className="mt-4 space-y-3">
        {BANDEJA.map((s) => (
          <li
            key={s.codigo}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-tarjeta sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] tabular-nums text-muted-foreground">
                {s.codigo}
              </p>
              <p className="mt-0.5 font-semibold">{s.categoria}</p>
              <p className="mt-0.5 truncate text-muted-foreground">
                {s.detalle}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
              <Etiqueta clase="bg-muted text-pizarra">
                {s.estudiantes}
              </Etiqueta>
              {"esperando" in s && (
                <Etiqueta clase="bg-naranjo font-semibold text-tinta">
                  Esperando aclaración
                </Etiqueta>
              )}
              <Etiqueta clase={URGENCIA[s.urgencia]}>{s.urgencia}</Etiqueta>
              <Etiqueta>{s.estado}</Etiqueta>
            </div>
          </li>
        ))}
      </ul>
    </Marco>
  );
}

// Los momentos de "Cómo avanza": recortes de 4:5 de cada pantalla.
function Momento({ children }: { children: ReactNode }) {
  return (
    <Marco className="flex aspect-[4/5] w-full flex-col p-5">{children}</Marco>
  );
}

export function RegistroFragmento() {
  return (
    <Momento>
      <p className="font-semibold">Registrar situación · 7° básico B</p>
      <p className="mt-3 text-[13px] font-medium">Fecha y hora del hecho</p>
      <p className="mt-1 rounded-lg border border-input px-3 py-2 tabular-nums">
        14-10-2026 11:20
      </p>
      <p className="mt-3 text-[13px] font-medium">Urgencia</p>
      <div className="mt-1 flex gap-1.5">
        {["Normal", "Urgente", "Inmediata"].map((u) => (
          <span
            key={u}
            className={`rounded-lg border px-2.5 py-1.5 text-[13px] ${
              u === "Inmediata"
                ? "border-primary bg-accent font-semibold"
                : "border-input"
            }`}
          >
            {u}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[13px] font-medium">Estudiantes</p>
      <ul className="mt-1 divide-y divide-border rounded-lg border border-border">
        {[
          ["Bravo, Amanda", "Afectada"],
          ["Castro, Tomás", "Involucrado"],
          ["Cortés, Antonella", "No participa"],
        ].map(([nombre, rol]) => (
          <li key={nombre} className="flex justify-between gap-2 px-3 py-2">
            <span>{nombre}</span>
            <span className="text-muted-foreground">{rol}</span>
          </li>
        ))}
      </ul>
    </Momento>
  );
}

export function LlegaFragmento() {
  return (
    <Momento>
      <p className="font-semibold">Bandeja de situaciones</p>
      <div className="mt-3 space-y-2.5">
        {BANDEJA.slice(0, 3).map((s) => (
          <div key={s.codigo} className="rounded-xl border border-border p-3">
            <p className="text-[13px] tabular-nums text-muted-foreground">
              {s.codigo}
            </p>
            <p className="font-semibold">{s.categoria}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Etiqueta clase={URGENCIA[s.urgencia]}>{s.urgencia}</Etiqueta>
              <Etiqueta>{s.estado}</Etiqueta>
            </div>
          </div>
        ))}
      </div>
    </Momento>
  );
}

export function RevisionFragmento() {
  return (
    <Momento>
      <p className="text-[13px] tabular-nums text-muted-foreground">
        SIT-2026-00041
      </p>
      <p className="font-semibold">Agresión verbal</p>
      <div className="mt-2 flex gap-1.5">
        <Etiqueta clase={URGENCIA.Inmediata}>Inmediata</Etiqueta>
        <Etiqueta>En revisión</Etiqueta>
      </div>
      <p className="mt-4 text-[13px] font-medium">Cambiar urgencia</p>
      <p className="mt-1 rounded-lg border border-input px-3 py-2">Urgente</p>
      <p className="mt-3 text-[13px] font-medium">Motivo del cambio</p>
      <p className="mt-1 flex-1 rounded-lg border border-input px-3 py-2 text-muted-foreground">
        Se conversó con ambos estudiantes en el recreo y la situación está
        contenida.
      </p>
      <span className="mt-3 rounded-lg bg-primary px-4 py-2.5 text-center font-medium text-primary-foreground">
        Guardar urgencia
      </span>
    </Momento>
  );
}

export function AclaracionFragmento() {
  return (
    <Momento>
      <p className="font-semibold">Pedir aclaración</p>
      <p className="mt-1 text-muted-foreground">
        Se envía a P. Rojas, que registró la situación.
      </p>
      <p className="mt-3 flex-1 rounded-lg border border-input px-3 py-2">
        ¿Había otro adulto en la cancha cuando empezó la discusión? ¿Quién avisó
        primero?
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Etiqueta clase="bg-naranjo font-semibold text-tinta">
          Esperando aclaración
        </Etiqueta>
        <span className="text-[13px] tabular-nums text-muted-foreground">
          15-10-2026 09:05
        </span>
      </div>
    </Momento>
  );
}

export function RespuestaFragmento() {
  return (
    <Momento>
      <p className="font-semibold">Aclaraciones pedidas</p>
      <div className="mt-3 flex-1 rounded-xl border border-border p-3">
        <p className="font-medium">
          ¿Había otro adulto en la cancha cuando empezó la discusión?
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Pedida por Convivencia el 15-10-2026
        </p>
        <p className="mt-3 rounded-lg bg-muted px-3 py-2">
          Estaba el inspector de patio. Avisó una estudiante de 8° básico.
        </p>
        <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">
          Respondida el 15-10-2026 13:40
        </p>
      </div>
      <p className="mt-3 text-[13px] text-muted-foreground">
        La respuesta enviada se conserva y no se puede cambiar.
      </p>
    </Momento>
  );
}

export function DecisionFragmento() {
  return (
    <Momento>
      <p className="font-semibold">Decidir la revisión</p>
      <div className="mt-3 space-y-2">
        {[
          ["Dejar como antecedente", true],
          ["Descartar con fundamento", false],
          ["Vincular a un caso", false],
        ].map(([texto, elegido]) => (
          <p
            key={texto as string}
            className={`rounded-lg border px-3 py-2.5 ${
              elegido
                ? "border-primary bg-accent font-semibold"
                : "border-input"
            }`}
          >
            {texto}
          </p>
        ))}
      </div>
      <p className="mt-3 text-[13px] font-medium">Fundamento</p>
      <p className="mt-1 flex-1 rounded-lg border border-input px-3 py-2 text-muted-foreground">
        Hecho aislado. Se informó a los apoderados.
      </p>
    </Momento>
  );
}

export function HistorialFragmento() {
  return (
    <Momento>
      <p className="font-semibold">Historial · Amanda Bravo</p>
      <p className="mt-1 text-muted-foreground">Curso actual: 7° básico B</p>
      <ul className="mt-3 space-y-2.5">
        {[
          ["14-10-2026", "Agresión verbal", "7° básico B (2026)"],
          ["22-08-2025", "Conflicto entre pares", "6° básico B (2025)"],
          ["03-05-2024", "Daño a materiales", "5° básico A (2024)"],
        ].map(([fecha, categoria, curso]) => (
          <li key={fecha} className="rounded-xl border border-border p-3">
            <p className="text-[13px] tabular-nums text-muted-foreground">
              {fecha}
            </p>
            <p className="font-semibold">{categoria}</p>
            <p className="text-[13px] text-muted-foreground">
              Curso al ocurrir el hecho: {curso}
            </p>
          </li>
        ))}
      </ul>
    </Momento>
  );
}

// Vistas previas de "Qué incluye".
function Vista({ children }: { children: ReactNode }) {
  return <Marco className="w-full p-6">{children}</Marco>;
}

export function PerfilesFragmento() {
  return (
    <Vista>
      <p className="text-lg font-semibold">Mis cursos</p>
      <p className="mt-1 text-muted-foreground">
        El profesor ve solo los cursos que tiene asignados.
      </p>
      <ul className="mt-4 space-y-3">
        {[
          ["7° básico B", "Profesor jefe", "34 estudiantes"],
          ["8° básico A", "Profesor", "31 estudiantes"],
          ["1° medio C", "Profesor", "36 estudiantes"],
        ].map(([curso, rol, total]) => (
          <li
            key={curso}
            className="flex items-center justify-between gap-3 rounded-xl border border-border p-4"
          >
            <div>
              <p className="font-semibold">{curso}</p>
              <p className="text-muted-foreground">{rol}</p>
            </div>
            <Etiqueta clase="bg-muted text-pizarra">{total}</Etiqueta>
          </li>
        ))}
      </ul>
      <span className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground">
        Registrar situación
      </span>
    </Vista>
  );
}

export function ImportacionFragmento() {
  return (
    <Vista>
      <p className="text-lg font-semibold">nomina-estudiantes-2027.xlsx</p>
      <p className="mt-1 text-muted-foreground">
        Revisa cada fila antes de confirmar. Nada se guarda todavía.
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Etiqueta clase="bg-accent text-accent-foreground">
          1.204 válidas
        </Etiqueta>
        <Etiqueta clase="bg-amarillo/25 text-tinta">8 con advertencia</Etiqueta>
        <Etiqueta clase="bg-destructive/10 text-destructive">
          2 con error
        </Etiqueta>
      </div>
      <table className="mt-4 w-full text-left tabular-nums">
        <thead className="text-[13px] text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 pr-3 font-medium">Fila</th>
            <th className="py-2 pr-3 font-medium">Estudiante</th>
            <th className="py-2 font-medium">Curso</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["12", "Muñoz Vera, Benjamín", "1° medio A"],
            ["13", "Soto Rojas, Martina", "1° medio A"],
            ["14", "Díaz Lagos, Joaquín", "Falta el curso"],
          ].map(([fila, nombre, curso]) => (
            <tr key={fila} className="border-b border-border last:border-0">
              <td className="py-2 pr-3 text-muted-foreground">{fila}</td>
              <td className="py-2 pr-3">{nombre}</td>
              <td
                className={`py-2 ${
                  curso === "Falta el curso" ? "text-destructive" : ""
                }`}
              >
                {curso}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Vista>
  );
}

export function SegundoFactorFragmento() {
  return (
    <Vista>
      <p className="text-lg font-semibold">Verificación en dos pasos</p>
      <p className="mt-1 text-muted-foreground">
        Escribe el código de 6 dígitos de tu app de autenticación.
      </p>
      <div className="mt-5 flex gap-2">
        {["4", "8", "2", "9", "1", "7"].map((d, i) => (
          <span
            key={i}
            className="flex size-12 items-center justify-center rounded-lg border border-input text-xl font-semibold tabular-nums"
          >
            {d}
          </span>
        ))}
      </div>
      <span className="mt-5 flex justify-center rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground">
        Verificar
      </span>
      <p className="mt-4 text-muted-foreground">
        Administración y Convivencia lo usan siempre, además de la contraseña.
      </p>
    </Vista>
  );
}