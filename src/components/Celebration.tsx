import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { PersonalRecordHit } from '../lib/stats';
import { fmtKg } from '../lib/utils';
import { IconTrophy } from './Icons';

/** Festeggiamento di un record: solo transform/opacity, nessun blur, così resta fluido */
export function Celebration({ hit, onDone }: { hit: PersonalRecordHit & { id: number }; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 2600);
    return () => window.clearTimeout(t);
  }, [hit.id, onDone]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
        const dist = 120 + Math.random() * 120;
        return {
          dx: `${Math.cos(angle) * dist}px`,
          dy: `${Math.sin(angle) * dist - 40}px`,
          rot: `${Math.random() * 540 - 270}deg`,
          color: i % 3 === 0 ? 'var(--gold)' : i % 3 === 1 ? 'var(--accent)' : '#ff6b8b',
          delay: `${Math.random() * 120}ms`,
          w: 6 + Math.random() * 6,
        };
      }),
    [hit.id], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return createPortal(
    <div key={hit.id} className="pointer-events-none fixed inset-0 z-[65] flex items-center justify-center" role="status" aria-live="polite">
      <div className="anim-glow absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 45%, var(--gold-soft), transparent 65%)' }} />
      <div className="relative flex flex-col items-center">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="confetti-piece absolute top-12 left-1/2 rounded-[2px]"
            style={
              {
                width: p.w,
                height: p.w * 0.45,
                background: p.color,
                animationDelay: p.delay,
                '--dx': p.dx,
                '--dy': p.dy,
                '--rot': p.rot,
              } as React.CSSProperties
            }
          />
        ))}
        <div className="anim-trophy flex flex-col items-center">
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-gold text-white shadow-[0_12px_40px_-8px_var(--gold)]">
            <IconTrophy size={48} strokeWidth={2.2} />
          </span>
          <p className="mt-4 text-[28px] font-bold">Nuovo record!</p>
          <p className="num mt-1 rounded-full bg-elevated px-4 py-1.5 text-[17px] font-semibold shadow-lg">
            {hit.exerciseName} ·{' '}
            {hit.kind === 'peso' ? `${fmtKg(hit.value)} kg` : `1RM ${fmtKg(Math.round(hit.value * 10) / 10)} kg`}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
