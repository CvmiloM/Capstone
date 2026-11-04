// PB-124 (HU-105): una propuesta de la IA se muestra siempre como no oficial.
// Publicarla o aplicarla no la convierte en protocolo oficial (CA2) y para
// publicarla se exige revisor y documento de origen (CA3). Las notas de la
// versión generada traen la declaración de CONVI y las fuentes (CA1).
export function AvisoPropuesta({ notas = null }: { notas?: string | null }) {
  return (
    <div className="mb-6 rounded-2xl border border-dashed border-amarillo bg-amarillo/10 p-4 text-sm">
      <p className="font-semibold">Propuesta de la IA, no oficial</p>
      <p className="mt-1 text-muted-foreground">
        La IA propuso estos pasos porque el caso no tenía un protocolo oficial:
        revísalos con sus fuentes, para usarla se publica con revisor y
        documento de origen, igual que un protocolo, y aunque se publique o se
        aplique a un caso nunca pasa a ser oficial
      </p>
      {notas && (
        <details className="mt-3">
          <summary className="cursor-pointer font-medium text-primary">
            Ver las fuentes del reglamento
          </summary>
          <p className="mt-2 whitespace-pre-line text-muted-foreground">
            {notas}
          </p>
        </details>
      )}
    </div>
  );
}
