import type { ComponentProps, ReactNode } from "react";

// Piezas de formulario compartidas. Usan solo los colores de globals.css.
// Cuando el proyecto tenga shadcn/ui se pueden reemplazar por sus componentes.

export function Encabezado({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      {descripcion && (
        <p className="mt-1.5 text-sm text-muted-foreground">{descripcion}</p>
      )}
    </div>
  );
}

type CampoProps = ComponentProps<"input"> & {
  name: string;
  etiqueta: string;
  ayuda?: string;
  error?: string;
  /** Elemento que se muestra dentro del campo, a la derecha (por ejemplo, "Mostrar"). */
  accesorio?: ReactNode;
};

export function Campo({
  name,
  etiqueta,
  ayuda,
  error,
  accesorio,
  id = name,
  className = "",
  ...props
}: CampoProps) {
  const idDescripcion = error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium">
        {etiqueta}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={idDescripcion}
          className={`block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-3 focus:ring-ring/15 ${
            error ? "border-destructive" : "border-input"
          } ${accesorio ? "pr-20" : ""}`}
          {...props}
        />
        {accesorio && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
            {accesorio}
          </div>
        )}
      </div>
      {error ? (
        <p id={idDescripcion} className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : ayuda ? (
        <p id={idDescripcion} className="mt-1.5 text-sm text-muted-foreground">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

export function BotonEnviar({
  pendiente,
  textoPendiente,
  children,
}: {
  pendiente: boolean;
  textoPendiente: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pendiente}
      className={`w-full ${claseBotonPrimario}`}
    >
      {pendiente ? textoPendiente : children}
    </button>
  );
}

export function AvisoError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
    >
      {children}
    </div>
  );
}

export const claseEnlace =
  "font-medium text-primary underline-offset-4 hover:underline";

// Estilos de botón, para <button> y también para <Link> con forma de botón
export const claseBotonPrimario =
  "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60";

export const claseBotonSecundario =
  "inline-flex items-center justify-center rounded-lg border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
