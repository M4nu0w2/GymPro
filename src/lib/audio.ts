/**
 * Suoni con Web Audio API. Safari richiede che l'AudioContext venga
 * creato/sbloccato durante un gesto dell'utente: installUnlock() lo fa al primo tocco.
 */
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

export function unlockAudio(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  // Buffer silenzioso: sblocca definitivamente l'output su iOS
  const buf = c.createBuffer(1, 1, 22050);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start(0);
}

export function installAudioUnlock(): void {
  const handler = () => {
    unlockAudio();
    // Dopo un ritorno dal background il contesto può tornare "suspended"
    if (ctx?.state === 'running') {
      window.removeEventListener('touchend', handler, true);
      window.removeEventListener('click', handler, true);
    }
  };
  window.addEventListener('touchend', handler, true);
  window.addEventListener('click', handler, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx?.state !== 'running') {
      window.addEventListener('touchend', handler, true);
      window.addEventListener('click', handler, true);
    }
  });
}

function tone(c: AudioContext, freq: number, start: number, dur: number, gain = 0.35) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** Segnale di fine recupero: tre beep ascendenti */
export function playRestDone(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const t = c.currentTime + 0.02;
  tone(c, 880, t, 0.16);
  tone(c, 880, t + 0.22, 0.16);
  tone(c, 1320, t + 0.44, 0.38, 0.45);
  // Vibrazione dove supportata (non su iOS)
  navigator.vibrate?.([120, 80, 120, 80, 240]);
}

/** Beep breve (ultimi 3 secondi) */
export function playTick(): void {
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  tone(c, 660, c.currentTime + 0.01, 0.08, 0.18);
}
