import { useEffect, useRef, useState } from 'react';
import { playRestDone, playTick } from '../lib/audio';
import { getSettings } from '../lib/settings';

/** Entro quanto dalla scadenza il timer è considerato "appena finito" (app in primo piano) */
const FRESH_MS = 4000;

/**
 * Timer di recupero basato sul timestamp di fine: il tempo rimanente è sempre
 * calcolato come endsAt - Date.now(), quindi resta corretto anche dopo
 * blocco schermo o background. Il loop gira solo con l'app visibile (rAF),
 * quindi beep e avviso di fine partono solo in primo piano.
 * `onDone(fresh)`: fresh = scaduto adesso con l'app aperta (non al ritorno dopo minuti).
 */
export function useRestTimer(endsAt: number | null, onDone: (fresh: boolean) => void) {
  const [now, setNow] = useState(() => Date.now());
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (endsAt == null) return;
    let raf = 0;
    let fired = false;
    let lastSec = -1;
    const loop = () => {
      const t = Date.now();
      const remaining = (endsAt - t) / 1000;
      const secLeft = Math.ceil(remaining);
      // aggiorna lo stato React solo quando cambia il decimo di secondo: meno render
      const tenth = Math.floor((endsAt - t) / 100);
      if (tenth !== lastSec) {
        lastSec = tenth;
        setNow(t);
      }
      const settings = getSettings();
      if (secLeft <= 3 && secLeft >= 1 && lastTick.current !== secLeft) {
        lastTick.current = secLeft;
        if (settings.sound && settings.countdownTicks && document.visibilityState === 'visible') playTick();
      }
      if (remaining <= 0 && !fired) {
        fired = true;
        const fresh = t - endsAt < FRESH_MS && document.visibilityState === 'visible';
        if (settings.sound && fresh) playRestDone();
        doneRef.current(fresh);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // rAF si ferma in background: al ritorno ricalcoliamo subito
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      lastTick.current = null;
    };
  }, [endsAt]);

  const remainingMs = endsAt == null ? 0 : Math.max(0, endsAt - now);
  return { remainingSec: remainingMs / 1000, running: endsAt != null && remainingMs > 0 };
}
