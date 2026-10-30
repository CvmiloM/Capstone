import { crearClienteServidor } from "@/lib/supabase/servidor";
import { AvatarUsuario } from "./avatar-usuario";

/**
 * Quién inició sesión, con su blob, para los portales que no tenían este dato.
 * El correo sale del token de Supabase ya validado en el servidor: no se le pide nada a la
 * API y el navegador solo recibe el dibujo y el texto del correo.
 */
export async function UsuarioPortal({
  compacto = false,
}: {
  compacto?: boolean;
}) {
  const supabase = await crearClienteServidor();
  // getClaims valida la firma del token antes de usar el correo.
  const { data } = await supabase.auth.getClaims();
  const correo =
    typeof data?.claims?.email === "string" ? data.claims.email : undefined;
  if (!correo) return null;

  return (
    <div
      className={`flex min-w-0 items-center gap-2.5 ${compacto ? "" : "mb-3"}`}
    >
      <AvatarUsuario correo={correo} tamano={compacto ? 32 : 36} siempre />
      <p
        className={`min-w-0 truncate text-muted-foreground ${compacto ? "hidden text-sm sm:block" : "text-xs"}`}
        title={correo}
      >
        {correo}
      </p>
    </div>
  );
}

/** Mismo espacio que ocupa el bloque mientras se lee la sesión. */
export function EsqueletoUsuarioPortal({
  compacto = false,
}: {
  compacto?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center gap-2.5 ${compacto ? "" : "mb-3"}`}
    >
      <span
        className={`animate-pulse rounded-full bg-muted ${compacto ? "size-8" : "size-9"}`}
      />
      <span className="h-3 w-28 animate-pulse rounded bg-muted" />
    </div>
  );
}
