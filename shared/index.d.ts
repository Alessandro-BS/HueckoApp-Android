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

export type GroupMember = User & { role: 'ORGANIZER' | 'MEMBER'; isEssential: boolean };

// Cuerpo de PATCH /groups/:id/members/:userId: al menos uno de los dos campos.
export type UpdateMemberInput = { isEssential?: boolean; role?: GroupMember['role'] };

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
  date: string;                  // YYYY-MM-DD (America/Lima) del día concreto de la franja
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
  date: string;                    // "YYYY-MM-DD" en America/Lima: el día concreto de la franja
  dayOfWeek: number;               // 1 = lunes … 7 = domingo, siempre el de `date`
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
  criticalReason: string | null;   // por qué la incidencia es crítica (abre votación exprés); null si no lo es
  createdAt: string;
};

export type ExpressOption = 'CANCELAR' | 'REAGENDAR' | 'MANTENER';

// Votación exprés grupal: una ausencia crítica en un plan confirmado abre una votación corta (docs/api.md, «Votación exprés»).
export type ExpressVote = {
  id: string;
  status: 'ABIERTA' | 'CERRADA';
  reportedBy: User;
  reason: string;
  criticalReason: string;
  openedAt: string;
  expiresAt: string;
  closedAt: string | null;
  counts: Record<ExpressOption, number>;
  myVote: ExpressOption | null;
  canVote: boolean;
  eligibleVoters: number;
  quorum: number;
  result: ExpressOption | null;
  resultByDefault: boolean | null;
  recommendation: { option: ExpressOption; reason: string } | null;
};

export type Proposal = {
  id: string;
  groupId: string;
  title: string;
  location: Location | null;
  createdBy: User;
  votingDeadline: string;          // ISO 8601 (UTC); solo se vota antes de esta hora
  state: ProposalState;
  windows: TimeWindow[];           // ordenadas por fecha y hora
  multipleVotes: boolean;          // true: se pueden votar varias franjas; false: un voto por persona (votar otra lo mueve)
  autoClosed: boolean;             // true si el servidor cerró la votación solo (reservado; hasta ahora siempre false)
  myVoteWindowIds: string[];       // franjas que votó el usuario actual, en el orden de `windows`
  canManage: boolean;              // true si el usuario actual puede confirmar, cancelar o replantear (docs/api.md, «Quién gestiona un plan»)
  chosenWindowId: string | null;   // se llena al confirmar
  scheduledAt: string | null;      // ISO: inicio de la franja elegida (su fecha y hora en America/Lima), fijado al confirmar
  scheduledDate: string | null;    // "YYYY-MM-DD": la fecha de la franja elegida (para mostrarla sin depender de la zona del teléfono)
  incidences: Incidence[];
  expressVote: ExpressVote | null; // la votación exprés más reciente del plan (abierta o cerrada), si hay
  createdAt: string;               // ISO; GET /groups/:id/proposals ordena por aquí (más recientes primero)
};

// Cuerpos de las peticiones de propuestas (docs/api.md, «Propuestas y votación»).
export type TimeWindowInput = {
  date: string;                    // "YYYY-MM-DD" en America/Lima, entre esta semana y las próximas 3
  startTime: string;
  endTime: string;
};

export type ProposalInput = {
  title: string;
  location?: Location | null;
  votingDeadline: string;          // ISO 8601 futura y anterior al inicio de la primera franja
  windows?: TimeWindowInput[];     // de 2 a 5; vacío u omitido: el servidor propone las 3 mejores franjas de `week`
  multipleVotes?: boolean;         // por defecto true
  week?: string;                   // lunes "YYYY-MM-DD" (cualquier día se normaliza); solo se usa sin `windows`; por defecto, esta semana
};

export type IncidenceInput = { type: IncidenceType; reason: string; delayMinutes?: number | null };

// Voto en la votación exprés (PUT /proposals/:id/express-vote); se puede cambiar mientras siga abierta.
export type ExpressVoteInput = { option: ExpressOption };

// Replantear una propuesta en votación: franjas (2 a 5) y plazo nuevos; se borran los votos.
export type ReplanInput = { votingDeadline: string; windows: TimeWindowInput[] };

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
  kind: 'VOTACION' | 'RECOORDINACION' | 'AVISO'; // votación exprés abierta; plan EN_RECOORDINACION; o CONFIRMADO con incidencias sin resolver
  canResolve: boolean;                  // = canManage del plan para el usuario actual
  canVote: boolean;                     // solo en VOTACION: el canVote de la votación abierta; false en los demás
  createdBy: User;
  expiresAt: string | null;             // ISO: cuándo vence la votación; solo en VOTACION, null en los demás
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
export type AiTask = 'schedule-ocr' | 'proposal-draft' | 'plan-suggestions' | 'voting-summary' | 'express-recommendation';

// Respuesta de POST /ai/schedule-ocr: bloques SIN guardar, para revisarlos y guardarlos con /me/time-blocks/bulk.
export type ScheduleOcrResult = { blocks: TimeBlockInput[] };

// Tipo de plan que sugiere la IA (solo en sus respuestas: la propuesta no guarda categoría).
export type PlanCategory = 'ESTUDIO' | 'REUNION' | 'COMIDA' | 'DEPORTE' | 'SALIDA' | 'OTRO';

// Cuerpo de POST /groups/:id/ai/proposal-draft.
export type ProposalDraftInput = {
  text: string;
  week?: string;                   // lunes "YYYY-MM-DD" (cualquier día se normaliza); por defecto, esta semana y la siguiente
};

// Borrador para pre-rellenar «Nueva propuesta». No se guarda nada hasta que el usuario crea la propuesta.
export type ProposalDraft = {
  title: string;
  category: PlanCategory;
  placeName: string | null;
  window: MatchWindow | null;      // dentro de un hueco real del grupo (GET /groups/:id/availability), recortado a lo pedido, o null
  windows: MatchWindow[];          // 2–5 opciones para votar (la primera = `window`), con las mismas reglas
  votingDeadline: string;          // ISO futura sugerida (antes de la opción que llega primero)
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
  organizers: User[];              // quienes organizan el grupo, del más antiguo al más nuevo; [] si no hay miembros
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

// Cuerpo de POST /admin/proposals/:id/cancel: el motivo es obligatorio (3-200 caracteres tras el trim).
export type AdminCancelProposalInput = { reason: string };

// ---- Estadísticas e informes (calculados solo en el servidor; la app los muestra y exporta) ----

export type ProposalCounts = Record<ProposalState, number>;

export type AiTaskStats = {
  task: AiTask;
  calls: number;
  ok: number;
  successRate: number | null;      // % entero de llamadas con respuesta válida; null si no hubo llamadas
  avgDurationMs: number | null;
};

export type AiUsage = { calls: number; ok: number; successRate: number | null; byTask: AiTaskStats[] };

export type AdminStats = {
  users: { total: number; active: number; suspended: number; admins: number };
  groups: number;
  proposals: ProposalCounts;
  confirmedPlans: number;          // CONFIRMADO o EN_RECOORDINACION
  incidences: number;
  ai: AiUsage;
};

export type StatsBucket = 'day' | 'week';

export type TimeseriesPoint = {
  start: string;                   // "YYYY-MM-DD": inicio del día o del lunes, en la zona del servidor
  registrations: number;
  groupsCreated: number;
  proposalsCreated: number;
  aiCalls: number;
};

// from/to: los días pedidos ("YYYY-MM-DD", ambos incluidos), tal cual llegaron.
export type Timeseries = { from: string; to: string; bucket: StatsBucket; points: TimeseriesPoint[] };

export type HourCount = { hour: number; count: number };  // hour 0–23 en la zona del servidor

// from/to: los días pedidos ("YYYY-MM-DD", ambos incluidos), o null si no se pidió periodo.
export type PopularHours = { from: string | null; to: string | null; hours: HourCount[] };

// fromDate/toDate = primer y último día incluidos (los pedidos); from/to = el intervalo [from, to) en ISO
// que el servidor calculó con las medianoches de su zona (00:00 de fromDate y del día siguiente a toDate).
export type ReportPeriod = { from: string; to: string; fromDate: string; toDate: string };

export type ReportSummary = {
  newUsers: number;
  newGroups: number;
  newProposals: number;
  confirmedPlans: number;          // planes en pie cuya fecha (scheduledAt) cae en el periodo
  incidences: number;
  aiCalls: number;
};

export type TopGroup = { id: string; name: string; proposals: number };

export type AdminReport = {
  period: ReportPeriod;
  generatedAt: string;
  bucket: StatsBucket;             // day si el periodo dura ≤ 31 días; si no, week
  summary: ReportSummary;
  proposalsByState: ProposalCounts; // de las propuestas creadas en el periodo
  ai: AiUsage;
  timeseries: TimeseriesPoint[];
  popularHours: HourCount[];
  topGroups: TopGroup[];           // hasta 5, por propuestas creadas en el periodo
};

// ---- Unirse a un grupo acercando el celular (docs/api.md, «Proximidad») ----

export type ProximityRole = 'INVITE' | 'JOIN';

export type ProximityStatus = 'WAITING' | 'MATCHED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'AMBIGUOUS' | 'CANCELLED';

export type ProximityRequest = {
  id: string;
  role: ProximityRole;
  status: ProximityStatus;
  group: { id: string; name: string } | null; // en JOIN, solo se conoce a partir de MATCHED
  peer: { id: string; name: string } | null;  // a partir de MATCHED
  expiresAt: string | null;      // ISO, en WAITING y MATCHED (cuenta atrás de la app); null en estados finales
  acceptableFrom: string | null; // ISO; en MATCHED, matched_at + 3 s; null en otros estados
};
