import { redirect } from "next/navigation";

export default async function HistorialCaso({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ antes?: string | string[] }>;
}) {
  const [{ id }, { antes }] = await Promise.all([params, searchParams]);
  const cursor =
    antes === undefined
      ? ""
      : `&antes=${encodeURIComponent(typeof antes === "string" ? antes : "invalida")}`;
  redirect(
    `/convivencia/casos/${encodeURIComponent(id)}?seccion=historial${cursor}`,
  );
}
