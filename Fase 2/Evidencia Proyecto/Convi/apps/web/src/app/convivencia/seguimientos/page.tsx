import { redirect } from "next/navigation";

// Refinamientos de Convivencia, sección 5.5: la Agenda de seguimientos solo
// listaba los seguimientos del mes con enlace a su caso, lo mismo que el
// calendario con el filtro Solo seguimientos. Esta dirección se conserva para
// los enlaces antiguos y lleva al calendario con ese filtro y el mismo mes.
export default async function AgendaSeguimientos({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const destino = new URLSearchParams({ seguimientos: "1" });
  if (mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) destino.set("mes", mes);
  redirect(`/convivencia/calendario?${destino}`);
}
