import { estadoPreparacion } from "@/app/components/documentos/datos";

export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return estadoPreparacion((await params).id);
}
