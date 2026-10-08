/** Esercizio all'interno di una scheda */
export interface PlanExercise {
  id: string;
  name: string;
  sets: number;
  /** Rep target: numero singolo ("8") o range ("8-10") */
  reps: string;
  restSec: number;
  notes?: string;
}

/** Scheda di allenamento */
export interface Plan {
  id: string;
  name: string;
  description?: string;
  exercises: PlanExercise[];
  createdAt: number;
  updatedAt: number;
}

/** Serie eseguita */
export interface SetLog {
  id: string;
  exerciseName: string;
  /** Nome normalizzato: lo storico è condiviso tra schede diverse */
  exerciseKey: string;
  setNumber: number;
  /** kg, con decimali */
  weight: number;
  reps: number;
  timestamp: number;
}

/** Esercizio "congelato" nella sessione (copia della scheda al momento dell'avvio) */
export interface SessionExercise {
  name: string;
  key: string;
  /** Serie previste (incrementate se si aggiunge una serie extra) */
  sets: number;
  reps: string;
  restSec: number;
  notes?: string;
  skipped?: boolean;
}

/** Stato UI dell'allenamento in corso, persistito per poterlo riprendere */
export interface SessionUiState {
  exIndex: number;
  restEndsAt: number | null;
  restTotalSec: number;
}

/** Sessione di allenamento */
export interface Session {
  id: string;
  planId: string;
  planName: string;
  startedAt: number;
  endedAt?: number;
  status: 'active' | 'done';
  exercises: SessionExercise[];
  sets: SetLog[];
  /** Chiavi degli esercizi con almeno una serie (indice multi-entry) */
  exerciseKeys: string[];
  ui?: SessionUiState;
}

/** Formato del backup completo */
export interface BackupFile {
  app: 'gympro';
  version: 1;
  exportedAt: string;
  plans: Plan[];
  sessions: Session[];
}
