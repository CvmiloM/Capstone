// Pantalla de carga de cursos. Cada ruta del portal necesita la suya: al
// navegar desde otra sección, la de admin/loading.tsx ya está montada y no
// envuelve los datos de esta página (cacheComponents la marca como bloqueante).
export default function CargandoCursos() {
  return (
    <div role="status" aria-label="Cargando">
      <div className="mb-2 h-8 w-64 max-w-full animate-pulse rounded-lg bg-muted" />
      <div className="mb-6 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="h-7 w-28 animate-pulse rounded-full bg-muted"
          />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="h-72 animate-pulse rounded-2xl bg-muted xl:col-span-2" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}