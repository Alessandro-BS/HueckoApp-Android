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
  votingDeadline: string;          // ISO 8601
  state: ProposalState;
  windows: TimeWindow[];
  myVoteWindowId: string | null;   // ventana que votó el usuario actual
  chosenWindowId: string | null;   // se llena al confirmar
  incidences: Incidence[];
};
