import { VerVersion } from "@/app/components/documentos/pantallas";
export default async function Pagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pagina?: string }>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  return <VerVersion portal="convivencia" id={id} pagina={q.pagina} />;
}
