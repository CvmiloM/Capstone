// PB-146 (HU-125): confirmar una importación que ya se está confirmando o que ya
// quedó Confirmada no inicia nada nuevo. La API responde la misma importación con
// su avance, la misma referencia que recibió la primera solicitud, en vez de un error.
export function confirmacionRepetida(estado: string) {
  return estado === 'PROCESANDO' || estado === 'CONFIRMADO';
}
