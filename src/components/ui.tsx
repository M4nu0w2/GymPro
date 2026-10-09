import { type ButtonHTMLAttributes, type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';
import { IconX } from './Icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink active:bg-accent-strong shadow-[0_8px_24px_-10px_var(--accent)]',
  secondary: 'bg-surface-2 text-fg active:bg-surface-3',
  ghost: 'bg-transparent text-fg active:bg-surface-2',
  danger: 'bg-danger/15 text-danger active:bg-danger/25',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-xl gap-1.5',
  md: 'h-12 px-4 text-[15px] rounded-2xl gap-2',
  lg: 'h-14 px-5 text-base rounded-2xl gap-2',
  xl: 'h-16 px-6 text-lg rounded-[22px] gap-2.5',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={cn(
        'tap inline-flex items-center justify-center font-semibold select-none disabled:opacity-40 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  className,
  label,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'tap inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg active:bg-surface-2 disabled:opacity-30',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  const cls = cn('rounded-3xl bg-surface border border-line', onClick && 'tap active:bg-surface-2 w-full text-left', className);
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  ) : (
    <div className={cls}>{children}</div>
  );
}

/** Intestazione di schermata con titolo grande stile iOS */
export function ScreenHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="pt-safe px-5">
      <div className="flex items-end justify-between gap-3 pt-4 pb-3">
        <div className="min-w-0">
          {subtitle && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{subtitle}</p>}
          <h1 className="truncate text-[34px] leading-tight font-extrabold tracking-tight">{title}</h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1 pb-1">{actions}</div>}
      </div>
    </header>
  );
}

/** Pannello che sale dal basso (fullscreen o metà schermo) */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  full = false,
  headerRight,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  full?: boolean;
  headerRight?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="anim-fade absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'anim-sheet relative flex flex-col bg-bg px-safe shadow-2xl',
          full ? 'h-full pt-safe' : 'max-h-[88%] rounded-t-[28px]',
        )}
      >
        {!full && <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-surface-3" />}
        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
          <IconButton label="Chiudi" onClick={onClose}>
            <IconX />
          </IconButton>
          <h2 className="min-w-0 flex-1 truncate text-center text-[17px] font-bold">{title}</h2>
          <div className="flex min-w-11 justify-end">{headerRight}</div>
        </div>
        <div className="scroll-area min-h-0 flex-1 px-4 pb-4">{children}</div>
        {footer && <div className="border-t border-line px-4 pt-3 pb-[max(12px,var(--safe-bottom))]">{footer}</div>}
        {!footer && <div className="pb-safe" />}
      </div>
    </div>,
    document.body,
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn('flex rounded-2xl bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'tap h-10 flex-1 rounded-xl text-sm font-semibold transition-colors',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="anim-pop flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-soft text-accent">{icon}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      {text && <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full h-12 rounded-2xl bg-surface-2 px-4 text-[16px] font-medium outline-none border border-transparent focus:border-accent placeholder:text-muted/70';

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-8 w-[52px] shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}
    >
      <span
        className={cn(
          'absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted', className)}>
      {children}
    </span>
  );
}
