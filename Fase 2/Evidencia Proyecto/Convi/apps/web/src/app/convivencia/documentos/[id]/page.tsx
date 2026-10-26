import { DetalleDocumento } from "@/app/components/documentos/pantallas";
export default async function Pagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardado?: string }>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  return (
    <DetalleDocumento
      portal="convivencia"
      id={id}
      guardado={q.guardado === "1"}
    />
  );
}
