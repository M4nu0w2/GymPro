/** ID univoco. crypto.randomUUID non esiste su http (es. test da LAN), quindi fallback. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' && isSecureContext) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Normalizza il nome esercizio: case-insensitive, spazi compressi, senza accenti */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parsing numero con virgola o punto */
export function parseNum(v: string): number | null {
  const s = v.replace(',', '.').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function fmtKg(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

export function fmtVolume(n: number): string {
  if (n >= 10000) return (n / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' t';
  return Math.round(n).toLocaleString('it-IT') + ' kg';
}

export function fmtDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m} min`;
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function fmtDate(ts: number, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return new Date(ts).toLocaleDateString('it-IT', opts);
}

export function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtRest(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}:${s.toString().padStart(2, '0')}` : `${m} min`;
}

/** Rep target "8-10" -> 8 ; "12" -> 12 ; altro -> null */
export function targetRepsMin(reps: string): number | null {
  const m = reps.match(/^\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

export const REPS_PATTERN = /^\d{1,3}(\s*-\s*\d{1,3})?$/;

export function cleanReps(reps: string): string {
  return reps.replace(/\s+/g, '');
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function cn(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
