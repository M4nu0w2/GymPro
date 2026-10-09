import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';
import { IconCheck, IconX } from './Icons';
import { Button } from './ui';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface FeedbackApi {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  toast: (msg: string, kind?: 'ok' | 'error') => void;
}

const Ctx = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('FeedbackProvider mancante');
  return c;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [toastState, setToastState] = useState<{ msg: string; kind: 'ok' | 'error'; id: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })),
    [],
  );
  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    window.clearTimeout(timer.current);
    setToastState({ msg, kind, id: Date.now() });
    timer.current = window.setTimeout(() => setToastState(null), 2600);
  }, []);

  const close = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <Ctx.Provider value={{ confirm, toast }}>
      {children}
      {dialog &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-8">
            <div className="anim-fade absolute inset-0 bg-[var(--dim)]" onClick={() => close(false)} />
            <div role="alertdialog" aria-label={dialog.title} className="glass-thick anim-scale relative w-full max-w-[300px] rounded-[30px] p-5 pt-6 text-center shadow-2xl">
              <h2 className="text-[17px] leading-snug font-semibold">{dialog.title}</h2>
              {dialog.message && <p className="mt-1.5 text-[14px] leading-snug text-fg-2">{dialog.message}</p>}
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <Button onClick={() => close(false)}>{dialog.cancelLabel ?? 'Annulla'}</Button>
                <Button
                  variant={dialog.danger ? 'secondary' : 'primary'}
                  className={dialog.danger ? '!bg-danger !text-white' : ''}
                  onClick={() => close(true)}
                >
                  {dialog.confirmLabel ?? 'Conferma'}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {toastState &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-4 pt-[calc(var(--safe-top)+8px)]">
            <div
              key={toastState.id}
              role="status"
              className="glass anim-pop flex max-w-full items-center gap-2 rounded-full py-2.5 pr-5 pl-3 text-[15px] font-semibold"
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                  toastState.kind === 'error' ? 'bg-danger text-white' : 'bg-accent text-accent-ink',
                )}
              >
                {toastState.kind === 'error' ? <IconX size={14} strokeWidth={3} /> : <IconCheck size={14} strokeWidth={3} />}
              </span>
              <span className="truncate">{toastState.msg}</span>
            </div>
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}
