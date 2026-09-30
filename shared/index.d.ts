// Tipos del contrato de la API de HueckoApp, compartidos por mobile/ y backend/.
// Documentación de cada endpoint: docs/api.md. Si cambias un tipo, revisa ambos lados en el mismo PR.

export type User = { id: string; name: string; email: string };

// Rol en la app y estado de la cuenta (docs/api.md, «Rol y estado de la cuenta»).
export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

// Quien inició sesión: solo lo devuelve /auth. Los demás usuarios (miembros, creadores…) siguen siendo `User`:
// el rol de otras personas no se publica.
export type CurrentUser = User & { role: UserRole };

export type AuthResponse = { token: string; user: CurrentUser };

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
  voteCount: number;               // solo votos de quienes siguen en el grupo (los de quien salió se conservan, pero no cuentan)
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
  canManage: boolean;              // true si el usuario actual puede confirmar, cancelar, reprogramar o resolver (docs/api.md, «Quién gestiona un plan»)
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
  canResolve: boolean;                  // = canManage del plan para el usuario actual
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

// Función de la app que llamó a la IA (estadísticas de administración, `ai_calls`).
export type AiTask = 'schedule-ocr' | 'proposal-draft' | 'plan-suggestions' | 'voting-summary';

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

// Respuesta de POST /proposals/:id/ai/summary. Solo es una sugerencia: nunca cambia el plan.
export type SummaryRecommendation = 'CONFIRMAR' | 'REPROGRAMAR' | 'CANCELAR';

export type VotingSummary = { summary: string; recommendation: SummaryRecommendation; reason: string };

// ---- Administración (docs/api.md, «Administración») ----

// Lista paginada: 20 por página, `page` desde 1.
export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

export type AdminUserSummary = User & { role: UserRole; status: UserStatus; createdAt: string; groupCount: number };

export type AdminUserGroup = { id: string; name: string; role: GroupMember['role'] };

export type AdminUserActivity = {
  proposalsCreated: number;
  votes: number;
  incidences: number;
  timeBlocks: number;
  aiCalls: number;
};

export type AdminUserDetail = AdminUserSummary & { groups: AdminUserGroup[]; activity: AdminUserActivity };

// Cuerpos de PATCH /admin/users/:id/status y /admin/users/:id/role.
export type UserStatusInput = { status: UserStatus };
export type UserRoleInput = { role: UserRole };

export type AuditAction =
  | 'USER_SUSPENDED'
  | 'USER_REACTIVATED'
  | 'USER_PROMOTED'
  | 'USER_DEMOTED'
  | 'GROUP_DELETED'
  | 'PROPOSAL_CANCELLED';

export type AuditTargetType = 'USER' | 'GROUP' | 'PROPOSAL';

// Lo justo para entender la acción aunque el objetivo ya no exista; nunca correos, contraseñas ni tokens.
export type AuditDetails = Record<string, string | number | boolean | null>;

export type AuditEntry = {
  id: string;
  action: AuditAction;
  admin: User | null;              // null = consola del servidor (npm run make-admin)
  targetType: AuditTargetType;
  targetId: string;
  details: AuditDetails;
  createdAt: string;
};

export type AdminGroupSummary = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  proposalCount: number;
  owner: User | null;              // OWNER actual; null si el grupo no tiene miembros
  createdAt: string;
};

export type AdminProposalSummary = {
  id: string;
  title: string;
  state: ProposalState;
  createdBy: User;
  createdAt: string;
  votingDeadline: string;
  scheduledAt: string | null;
  scheduledDate: string | null;
  voteCount: number;               // solo votos de quienes siguen en el grupo
  incidenceCount: number;
};

export type AdminGroupDetail = AdminGroupSummary & {
  inviteCode: string;
  availabilityThreshold: number;
  members: GroupMember[];
  proposals: AdminProposalSummary[]; // las más recientes primero
};

// Cuerpo (opcional) de POST /admin/proposals/:id/cancel.
export type AdminCancelProposalInput = { reason?: string };
