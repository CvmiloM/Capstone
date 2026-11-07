"use client";

import { useRef, useState } from "react";
import type { Orientacion } from "../../casos/[id]/acciones-orientacion";
import { OrientacionSituacion } from "../../casos/[id]/orientacion";
import { FormularioRevisionNormativa } from "./formularios";

type Opcion = { id: string; nombre: string };

// Mismos límites que valida la API (revision-normativa.ts).
const LARGO_MAXIMO_FUNDAMENTO = 4000;
const MAXIMO_REFERENCIAS = 10;

const ENLACE_DOCUMENTO = /^\/convivencia\/documentos\/versiones\/([^/?]+)(?:\?pagina=(\d+))?$/;
const ENLACE_PROTOCOLO = /^\/convivencia\/protocolos\/versiones\/([^/?]+)$/;

/**
 * Pasa la respuesta de CONVI IA a los campos de la revisión normativa: el texto
 * con la respuesta y los pasos, el protocolo citado y las páginas del reglamento
 * citadas, y el modo Asistida por IA. La aplicabilidad la elige la persona.
 */
function valoresDesdeIA(
  r: Orientacion,
  protocolos: Opcion[],
  documentos: Opcion[],
): Record<string, string> {
  const fundamento = [
    r.respuesta?.texto,
    ...r.pasos.map((p, i) => `${i + 1}. ${p.texto}`),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, LARGO_MAXIMO_FUNDAMENTO);
  const valores: Record<string, string> = {
    fundamento,
    modo_revision: "ASISTIDA_IA",
  };

  const protocolo = r.referencias
    .filter((ref) => ref.tipo === "PROTOCOLO" && ref.enlace)
    .map((ref) => ENLACE_PROTOCOLO.exec(ref.enlace!)?.[1])
    .find((id) => id && protocolos.some((p) => p.id === id));
  if (protocolo) valores.version_protocolo_id = protocolo;

  // Solo páginas de documentos que el formulario puede elegir, sin repetir.
  const paginas = new Set<string>();
  for (const ref of r.referencias) {
    if (ref.tipo !== "REGLAMENTO" || !ref.enlace) continue;
    const [, id, pagina] = ENLACE_DOCUMENTO.exec(ref.enlace) ?? [];
    if (!id || !pagina || !documentos.some((d) => d.id === id)) continue;
    const clave = `${id}:${pagina}`;
    if (paginas.has(clave) || paginas.size >= MAXIMO_REFERENCIAS) continue;
    const n = paginas.size;
    paginas.add(clave);
    valores[`ref_documento_${n}`] = id;
    valores[`ref_desde_${n}`] = pagina;
    valores[`ref_hasta_${n}`] = pagina;
  }
  return valores;
}

/**
 * Pestaña Revisión de una situación: preguntar a CONVI IA lo que indica la
 * normativa y, si sirve, pasarlo a la revisión normativa, que queda marcada como
 * asistida por IA. Sin usar la IA, la revisión sigue siendo manual como antes.
 */
export function RevisionNormativaConIA({
  situacionId,
  protocolos,
  documentos,
}: {
  situacionId: string;
  protocolos: Opcion[];
  documentos: Opcion[];
}) {
  const [copia, setCopia] = useState<{
    valores: Record<string, string>;
    vez: number;
  } | null>(null);
  const formulario = useRef<HTMLDivElement>(null);

  const usar = (resultado: Orientacion) => {
    setCopia((anterior) => ({
      valores: valoresDesdeIA(resultado, protocolos, documentos),
      vez: (anterior?.vez ?? 0) + 1,
    }));
    requestAnimationFrame(() =>
      formulario.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  return (
    <>
      <section
        aria-labelledby="preguntar-convi-ia"
        className="rounded-xl border border-border bg-background p-4"
      >
        <h3 id="preguntar-convi-ia" className="mb-3 font-semibold">
          Preguntar a CONVI IA
        </h3>
        <OrientacionSituacion situacionId={situacionId} alUsar={usar} />
      </section>

      <div ref={formulario} className="mt-6 scroll-mt-24 border-t border-border pt-4">
        <h3 className="mb-3 font-semibold">Registrar la revisión normativa</h3>
        {copia && (
          <p
            role="status"
            className="mb-4 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground"
          >
            Se copió la respuesta de CONVI IA: elige si la norma es aplicable,
            revisa el texto y las páginas, y guarda
          </p>
        )}
        <FormularioRevisionNormativa
          key={copia?.vez ?? 0}
          situacionId={situacionId}
          protocolos={protocolos}
          documentos={documentos}
          inicial={copia?.valores}
        />
      </div>
    </>
  );
}
