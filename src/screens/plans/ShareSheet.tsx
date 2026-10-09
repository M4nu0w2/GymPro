import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { useFeedback } from '../../components/Feedback';
import { IconCopy, IconShare } from '../../components/Icons';
import { Button, Sheet } from '../../components/ui';
import { useMuscleMap } from '../../lib/exercises';
import { encodePlan, shareUrl } from '../../lib/share';
import { normalizeName } from '../../lib/utils';
import type { Plan } from '../../types';

/** QR code come SVG (moduli scuri su fondo bianco: leggibile anche in dark mode) */
function qrSvg(text: string): string {
  const qr = qrcode(0, 'L');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

export function ShareSheet({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const muscles = useMuscleMap();
  const { toast } = useFeedback();

  const data = useMemo(() => {
    if (!plan) return null;
    const url = shareUrl(encodePlan(plan, (n) => muscles?.get(normalizeName(n))));
    return { url, svg: qrSvg(url) };
  }, [plan, muscles]);

  const share = async () => {
    if (!data || !plan) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Scheda ${plan.name}`, text: `Ti condivido la mia scheda "${plan.name}" su GymPro`, url: data.url });
        return;
      }
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
    }
    await copy();
  };

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.url);
      toast('Link copiato');
    } catch {
      toast('Impossibile copiare il link', 'error');
    }
  };

  return (
    <Sheet open={!!plan} onClose={onClose} title="Condividi scheda">
      {plan && data && (
        <div className="space-y-4 pb-2 text-center">
          <div>
            <p className="text-[22px] font-bold">{plan.name}</p>
            <p className="text-[15px] text-muted">{plan.exercises.length} esercizi</p>
          </div>
          <div className="mx-auto w-[min(260px,70vw)] rounded-[24px] bg-white p-3 shadow-sm" aria-label="QR code della scheda">
            <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: data.svg }} />
          </div>
          <p className="mx-auto max-w-xs text-[13px] leading-snug text-muted">
            Il link contiene solo la struttura della scheda (esercizi, serie, rep, recuperi). Storico e pesi non vengono condivisi.
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <Button size="lg" onClick={copy}>
              <IconCopy size={18} /> Copia link
            </Button>
            <Button variant="primary" size="lg" onClick={share}>
              <IconShare size={18} /> Condividi
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
