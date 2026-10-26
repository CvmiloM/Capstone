import { ListaDocumentos } from "@/app/components/documentos/pantallas";
export const metadata = { title: "Documentos institucionales" };
export default function Pagina() {
  return <ListaDocumentos portal="admin" />;
}
