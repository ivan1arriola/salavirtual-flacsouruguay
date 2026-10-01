export type AdminMeeting = Readonly<{
  id: string;
  requestId: string;
  title: string;
  programId: string;
  program: string;
  teacher: string;
  modality: string;
  modalityCustomized: boolean;
  startsAt: string;
  endsAt: string;
  assistanceStartsAt: string | null;
  assistanceEndsAt: string | null;
  timezone: string;
  state: string;
  requiresAssistance: boolean;
  googleAccount: string | null;
  meetUrl: string | null;
  description: string | null;
  assignment: Readonly<{
    id: string;
    assistantId: string;
    name: string;
    state: string;
  }> | null;
}>;

export type AdminPage = Readonly<{
  generatedAt: string;
  items: readonly AdminMeeting[];
  nextCursor: string | null;
}>;

export type AdminQuery = Readonly<{
  from: string;
  to: string;
  q?: string;
  programId?: string;
  state?: string;
  coverage?: "assigned" | "unassigned";
  cursor?: string;
  limit: number;
}>;

export type AdminSummary = Readonly<{
  generatedAt: string;
  upcoming: readonly AdminMeeting[];
  attention: readonly Readonly<{ code: string; label: string; count: number }>[];
}>;
