// Se muestra mientras una página del portal espera sus datos (HU-033 CA4).
// El menú y el encabezado del layout siguen visibles.
export default function CargandoAdmin() {
  return (
    <div role="status" aria-label="Cargando">
      <div className="mb-2 h-8 w-64 max-w-full animate-pulse rounded-lg bg-muted" />
      <div className="mb-6 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}