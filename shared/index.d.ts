// Tipos del contrato de la API de HueckoApp, compartidos por mobile/ y backend/.
// Documentación de cada endpoint: docs/api.md. Si cambias un tipo, revisa ambos lados en el mismo PR.

export type User = { id: string; name: string; email: string };

export type AuthResponse = { token: string; user: User };

export type BlockType = 'CLASE' | 'TRABAJO' | 'LIBRE' | 'PUNTUAL';

export type TimeBlock = {
  id: string;
  userId: string;
  label: string;           // "Clase de Cálculo"
  type: BlockType;
  startTime: string;       // "08:00"
  endTime: string;         // "10:00"
  isRecurring: boolean;
  dayOfWeek: number | null; // 1–7 si es recurrente; null si es puntual
  date: string | null;      // "YYYY-MM-DD" si es puntual; null si es recurrente
};

// Cuerpo de POST /me/time-blocks (y de cada elemento de /bulk): el servidor pone id y userId.
export type TimeBlockInput = Omit<TimeBlock, 'id' | 'userId'>;

export type GroupMember = User & { role: 'OWNER' | 'MEMBER'; isEssential: boolean };

export type GroupSummary = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  availabilityThreshold: number; // 0–100, % mínimo de coincidencia
};

export type Group = GroupSummary & {
  inviteCode: string;
  members: GroupMember[];
};

export type MatchWindow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  availabilityPercentage: number;
  freeMembers: number;
};

export type ProposalState = 'PROPUESTO' | 'CONFIRMADO' | 'CANCELADO' | 'EN_RECOORDINACION';

export type Location = {
  name: string;               // "Cafetería central"
  latitude: number | null;    // desde expo-location o el mapa
  longitude: number | null;
};

export type TimeWindow = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  availabilityPercentage: number;
  voteCount: number;
};

export type IncidenceType = 'FALTA' | 'TARDANZA' | 'IMPREVISTO';
export type Criticality = 'BAJA' | 'MEDIA' | 'ALTA';

export type Incidence = {
  id: string;
  user: User;
  type: IncidenceType;
  reason: string;
  delayMinutes: number | null;
  criticality: Criticality;
  resolved: boolean;
  createdAt: string;
};

export type Proposal = {
  id: string;
  groupId: string;
  title: string;
  location: Location | null;
  createdBy: User;
  votingDeadline: string;          // ISO 8601 (UTC); solo se vota antes de esta hora
  state: ProposalState;
  windows: TimeWindow[];           // ordenadas por día y hora
  myVoteWindowId: string | null;   // ventana que votó el usuario actual
  chosenWindowId: string | null;   // se llena al confirmar
  scheduledAt: string | null;      // ISO: próxima vez que ocurre la franja elegida, calculada al confirmar
  scheduledDate: string | null;    // "YYYY-MM-DD": la misma fecha en la zona horaria del servidor (para mostrarla sin depender de la del teléfono)
  incidences: Incidence[];
  createdAt: string;               // ISO; GET /groups/:id/proposals ordena por aquí (más recientes primero)
};

// Cuerpos de las peticiones de propuestas (docs/api.md, «Propuestas y votación»).
export type TimeWindowInput = { dayOfWeek: number; startTime: string; endTime: string };

export type ProposalInput = {
  title: string;
  location?: Location | null;
  votingDeadline: string;          // ISO 8601 futura
  windows?: TimeWindowInput[];     // vacío u omitido: el servidor propone las 3 mejores franjas
};

export type IncidenceInput = { type: IncidenceType; reason: string; delayMinutes?: number | null };

export type ResolveIncidencesInput =
  | { newState: 'CONFIRMADO' | 'CANCELADO' }
  | { newState: 'PROPUESTO'; votingDeadline: string };

// Propuesta con el nombre de su grupo (Inicio y /me/upcoming-plans).
export type ProposalWithGroup = Proposal & { groupName: string };

export type AttendeeStatus = 'PUNTUAL' | 'RETRASADO' | 'NO_ASISTE';

export type Attendee = { user: User; isEssential: boolean; status: AttendeeStatus; delayMinutes: number | null };

export type UpcomingPlan = ProposalWithGroup & { attendees: Attendee[] };

export type ExpressAlert = {
  proposalId: string;
  planTitle: string;
  groupName: string;
  who: string;                          // nombre de quien reportó la incidencia
  reason: string;
  kind: 'RECOORDINACION' | 'AVISO';     // EN_RECOORDINACION, o CONFIRMADO con incidencias sin resolver
  canResolve: boolean;                  // true si el usuario actual creó el plan
  createdBy: User;
};

export type DashboardGroup = {
  id: string;
  name: string;
  memberCount: number;
  nextWindow: Omit<TimeWindow, 'id' | 'voteCount'> | null;
};

export type DashboardMetrics = { activeGroups: number; openVotes: number; matchingHours: number; totalBlocks: number };

export type Dashboard = {
  metrics: DashboardMetrics;
  nextPlan: UpcomingPlan | null;
  groups: DashboardGroup[];
  pendingVotes: ProposalWithGroup[];
  expressAlert: ExpressAlert | null;
};

// ---- Inteligencia artificial (docs/api.md, «Inteligencia artificial») ----

// 'mock' = el servidor no tiene GEMINI_API_KEY y responde con datos de demostración.
export type AiProvider = 'gemini' | 'mock';

export type AiStatus = { provider: AiProvider };

// Respuesta de POST /ai/schedule-ocr: bloques SIN guardar, para revisarlos y guardarlos con /me/time-blocks/bulk.
export type ScheduleOcrResult = { blocks: TimeBlockInput[] };

// Tipo de plan que sugiere la IA (solo en sus respuestas: la propuesta no guarda categoría).
export type PlanCategory = 'ESTUDIO' | 'REUNION' | 'COMIDA' | 'DEPORTE' | 'SALIDA' | 'OTRO';

// Cuerpo de POST /groups/:id/ai/proposal-draft.
export type ProposalDraftInput = { text: string };

// Borrador para pre-rellenar «Nueva propuesta». No se guarda nada hasta que el usuario crea la propuesta.
export type ProposalDraft = {
  title: string;
  category: PlanCategory;
  placeName: string | null;
  window: MatchWindow | null;      // uno de los huecos reales del grupo (GET /groups/:id/availability), o null
  votingDeadline: string;          // ISO futura sugerida
};

export type PlanSuggestion = {
  title: string;
  category: PlanCategory;
  placeIdea: string | null;
  window: MatchWindow | null;      // uno de los huecos reales del grupo, o null
  reason: string;
};

// Respuesta de POST /groups/:id/ai/suggestions: entre 1 y 3 ideas.
export type PlanSuggestions = { suggestions: PlanSuggestion[] };
