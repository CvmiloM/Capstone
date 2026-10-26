import { NuevoDocumento } from "@/app/components/documentos/pantallas";
export const metadata = { title: "Subir documento" };
export default function Pagina() {
  return <NuevoDocumento portal="admin" />;
}
