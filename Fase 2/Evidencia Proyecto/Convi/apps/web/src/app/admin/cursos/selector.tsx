import type { ReactNode } from "react";

// Lista desplegable con el mismo estilo que Campo (components/formulario.tsx).
// Un select deshabilitado no se envía: si está fijo, su valor va oculto.
export function Selector({
  name,
  etiqueta,
  defaultValue,
  fijo = false,
  ayuda,
  error,
  children,
}: {
  name: string;
  etiqueta: string;
  defaultValue: string;
  fijo?: boolean;
  ayuda?: string;
  error?: string;
  children: ReactNode;
}) {
  const idDescripcion = error
    ? `${name}-error`
    : ayuda
      ? `${name}-ayuda`
      : undefined;

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {etiqueta}
      </label>
      {fijo && <input type="hidden" name={name} value={defaultValue} />}
      <select
        id={name}
        name={fijo ? undefined : name}
        defaultValue={defaultValue}
        disabled={fijo}
        aria-invalid={error ? true : undefined}
        aria-describedby={idDescripcion}
        className={`mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/15 disabled:bg-muted disabled:text-muted-foreground ${
          error ? "border-destructive" : "border-input"
        }`}
      >
        {children}
      </select>
      {idDescripcion && (
        <p
          id={idDescripcion}
          className={`mt-1.5 text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {error ?? ayuda}
        </p>
      )}
    </div>
  );
}