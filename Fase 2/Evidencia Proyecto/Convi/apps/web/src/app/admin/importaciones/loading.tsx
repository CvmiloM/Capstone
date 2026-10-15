// Pantalla de carga de importaciones. Cada ruta del portal necesita la suya:
// al navegar desde otra sección, la de admin/loading.tsx ya está montada y no
// envuelve los datos de esta página (cacheComponents la marca como bloqueante).
export default function CargandoImportaciones() {
  return (
    <div role="status" aria-label="Cargando">
      <div className="mb-2 h-8 w-64 max-w-full animate-pulse rounded-lg bg-muted" />
      <div className="mb-6 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="h-72 animate-pulse rounded-2xl bg-muted xl:col-span-2" />
        <div className="h-80 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}