// Se muestra mientras una página del portal espera los datos de la API.
export default function CargandoProfesor() {
  return (
    <div role="status" aria-label="Cargando">
      <div className="mb-2 h-8 w-56 max-w-full animate-pulse rounded-lg bg-muted" />
      <div className="mb-6 h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}