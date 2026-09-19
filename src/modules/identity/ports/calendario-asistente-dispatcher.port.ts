export type CalendarioAsistenteDispatcher = Readonly<{
  reconciliarCalendarioAsistente: (usuarioId: string) => Promise<void>;
}>;

