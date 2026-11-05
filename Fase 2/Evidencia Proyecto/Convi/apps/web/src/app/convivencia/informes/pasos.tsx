export function PasosInforme({ actual }: { actual:number }) {
  return <ol aria-label="Pasos para crear el informe" className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
    {["Propósito","Alcance","Contenido","Revisar"].map((texto,i)=><li key={texto} aria-current={actual===i+1?"step":undefined}
      className={"border-b-2 px-2 py-3 text-sm "+(actual===i+1?"border-primary font-semibold text-primary":"border-transparent text-muted-foreground")}>
      <span className="mr-2 tabular-nums">{i+1}</span>{texto}
    </li>)}
  </ol>;
}
