import type { Metadata } from "next";
import { Suspense } from "react";
import { EntradaPortal } from "@/app/components/entrada-portal";

export const metadata: Metadata = { title: "Convivencia" };

export default function PaginaConvivencia() {
  return (
    <Suspense
      fallback={
        <p
          role="status"
          className="px-4 py-12 text-center text-sm text-muted-foreground"
        >
          Comprobando tu acceso…
        </p>
      }
    >
      <EntradaPortal perfil="CONVIVENCIA" />
    </Suspense>
  );
}
