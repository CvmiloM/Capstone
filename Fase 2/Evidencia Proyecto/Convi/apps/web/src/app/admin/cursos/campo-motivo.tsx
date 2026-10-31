import { LARGO_MOTIVO } from "./opciones";

// PB-023 (HU-018 CA1): en un año Cerrado cada corrección pide su motivo, que
// la base guarda en la auditoría junto con quién y cuándo.
export function CampoMotivo({
  id,
  anio,
  defaultValue,
  error,
}: {
  id: string;
  anio: number;
  defaultValue?: string;
  error?: string;
}) {
  const descripcion = `${id}-${error ? "error" : "ayuda"}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        Motivo de la corrección
      </label>
      <textarea
        id={id}
        name="motivo"
        required
        rows={2}
        minLength={LARGO_MOTIVO.minimo}
        maxLength={LARGO_MOTIVO.maximo}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={descripcion}
        className={`mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/15 ${
          error ? "border-destructive" : "border-input"
        }`}
      />
      <p
        id={descripcion}
        className={`mt-1.5 text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}
      >
        {error ??
          `El año ${anio} está cerrado: explica por qué corriges este dato, queda en la auditoría con tu nombre y la fecha.`}
      </p>
    </div>
  );
}
