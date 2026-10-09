import { useEffect, useRef, useState } from 'react';
import { playRestDone, playTick } from '../lib/audio';
import { getSettings } from '../lib/settings';

/**
 * Timer di recupero basato sul timestamp di fine: il tempo rimanente è sempre
 * calcolato come endsAt - Date.now(), quindi resta corretto anche dopo
 * blocco schermo o background.
 */
export function useRestTimer(endsAt: number | null, onDone: () => void) {
  const [now, setNow] = useState(() => Date.now());
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (endsAt == null) return;
    let raf = 0;
    let fired = false;
    const loop = () => {
      const t = Date.now();
      setNow(t);
      const remaining = (endsAt - t) / 1000;
      const secLeft = Math.ceil(remaining);
      const settings = getSettings();
      if (secLeft <= 3 && secLeft >= 1 && lastTick.current !== secLeft) {
        lastTick.current = secLeft;
        if (settings.sound && settings.countdownTicks) playTick();
      }
      if (remaining <= 0 && !fired) {
        fired = true;
        // Suona solo se il timer è scaduto "da poco" (non alla riapertura dopo minuti)
        if (settings.sound && t - endsAt < 5000) playRestDone();
        doneRef.current();
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
