import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';
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
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <div className="anim-fade absolute inset-0 bg-black/60" onClick={() => close(false)} />
            <div role="alertdialog" className="anim-pop relative w-full max-w-sm rounded-[28px] bg-surface p-6 shadow-2xl">
              <h2 className="text-xl font-bold">{dialog.title}</h2>
              {dialog.message && <p className="mt-2 text-[15px] leading-relaxed text-muted">{dialog.message}</p>}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <Button onClick={() => close(false)}>{dialog.cancelLabel ?? 'Annulla'}</Button>
                <Button
                  variant={dialog.danger ? 'danger' : 'primary'}
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
          <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center pt-[calc(var(--safe-top)+10px)] px-4">
            <div
              key={toastState.id}
              className={cn(
                'anim-pop rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl',
                toastState.kind === 'error' ? 'bg-danger text-white' : 'bg-fg text-bg',
              )}
            >
              {toastState.msg}
            </div>
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}
