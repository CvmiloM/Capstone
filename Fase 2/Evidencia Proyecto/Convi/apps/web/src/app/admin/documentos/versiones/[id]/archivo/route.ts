import { archivoVersion } from "@/app/components/documentos/datos";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return archivoVersion(
    id,
    new URL(request.url).searchParams.get("ver") === "1",
  );
}
