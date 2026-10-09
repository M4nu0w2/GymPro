import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';
import { IconChevronRight, IconX } from './Icons';

type Variant = 'primary' | 'tinted' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink active:bg-accent-strong',
  tinted: 'bg-accent-soft text-accent',
  secondary: 'bg-surface-2 text-fg',
  ghost: 'bg-transparent text-accent',
  danger: 'bg-danger/12 text-danger',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3.5 text-[15px] gap-1.5',
  md: 'h-11 px-5 text-[17px] gap-2',
  lg: 'h-[52px] px-6 text-[17px] gap-2',
  xl: 'h-[60px] px-7 text-[19px] gap-2.5',
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
        'tap inline-flex items-center justify-center rounded-full font-semibold select-none disabled:pointer-events-none disabled:opacity-40',
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

/** Pulsante tondo stile barra di navigazione iOS */
export function IconButton({
  className,
  label,
  children,
  plain = false,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; plain?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'tap inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-30',
        plain ? 'text-accent' : 'bg-surface-2 text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  // uno sfondo passato da fuori sostituisce quello predefinito
  const cls = cn('rounded-[22px]', !/(^|\s)bg-/.test(className ?? '') && 'bg-surface', onClick && 'tap w-full text-left', className);
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  ) : (
    <div className={cls}>{children}</div>
  );
}

/**
 * Schermata con titolo grande stile iOS: il titolo scorre via e compare,
 * centrato e piccolo, nella barra in vetro in alto. Ogni schermata ha il suo scroll.
 */
export function Screen({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const root = scroller.current;
    const el = titleRef.current;
    if (!root || !el || typeof IntersectionObserver === 'undefined') return;
    const h = bar.current?.offsetHeight ?? 44;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting), {
      root,
      rootMargin: `-${h}px 0px 0px 0px`,
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={scroller} data-scroll className={cn('scroll-area px-safe h-full', className)}>
      <header ref={bar} className="pt-safe sticky top-0 z-20">
        {collapsed && <div className="glass-bar anim-fade pointer-events-none absolute inset-0" />}
        <div className="relative flex h-11 items-center justify-end gap-2 px-4">
          <p
            aria-hidden={!collapsed}
            className={cn(
              'pointer-events-none absolute inset-x-20 truncate text-center text-[17px] font-semibold transition-opacity duration-200',
              collapsed ? 'opacity-100' : 'opacity-0',
            )}
          >
            {title}
          </p>
          {actions}
        </div>
      </header>
      <div className="px-5 pb-2">
        {subtitle && <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">{subtitle}</div>}
        <h1 ref={titleRef} className="text-[34px] leading-[41px] font-bold tracking-[0.01em]">
          {title}
        </h1>
      </div>
      <div className="pb-tabbar">{children}</div>
    </div>
  );
}

/** Pannello che sale dal basso con maniglia: trascina giù per chiudere */
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
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const last = useRef<{ children: ReactNode; footer: ReactNode; title?: string; headerRight?: ReactNode }>({
    children,
    footer,
    title,
    headerRight,
  });
  if (open) last.current = { children, footer, title, headerRight };

  useLayoutEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = window.setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 250);
      return () => window.clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Trascinamento verso il basso dalla maniglia / intestazione
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current || !panel.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    drag.current.dy = dy;
    panel.current.style.transition = 'none';
    panel.current.style.transform = `translate3d(0, ${dy}px, 0)`;
  }, []);
  const onPointerUp = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    const el = panel.current;
    if (!d || !el) return;
    const v = d.dy / Math.max(1, performance.now() - d.t);
    el.style.transition = 'transform 380ms var(--ease-ios)';
    if (d.dy > 120 || (d.dy > 30 && v > 0.6)) {
      el.style.transform = 'translate3d(0, 100%, 0)';
      onClose();
    } else {
      el.style.transform = '';
    }
  }, [onClose]);

  if (!mounted) return null;
  const c = open ? { children, footer, title, headerRight } : last.current;
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className={cn('absolute inset-0 bg-[var(--dim)]', closing ? 'anim-fade-out' : 'anim-fade')} onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={c.title}
        className={cn(
          'glass-thick px-safe relative flex flex-col rounded-t-[32px] shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.35)]',
          full ? 'h-[calc(100%-var(--safe-top)-12px)]' : 'max-h-[90%]',
          closing ? 'anim-sheet-out' : 'anim-sheet',
        )}
      >
        <div
          className="shrink-0 touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mx-auto mt-[6px] h-[5px] w-9 rounded-full bg-faint" />
          <div className="flex items-center gap-2 px-4 pt-2.5 pb-2">
            <div className="flex min-w-9 justify-start">
              <IconButton label="Chiudi" onClick={onClose}>
                <IconX size={17} strokeWidth={2.6} />
              </IconButton>
            </div>
            <h2 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold">{c.title}</h2>
            <div className="flex min-w-9 justify-end">{c.headerRight}</div>
          </div>
        </div>
        <div className="scroll-area min-h-0 flex-1 px-4 pb-4">{c.children}</div>
        {c.footer && <div className="px-4 pt-3 pb-[max(14px,var(--safe-bottom))]">{c.footer}</div>}
        {!c.footer && <div className="pb-safe" />}
      </div>
    </div>,
    document.body,
  );
}

/** Controllo segmentato iOS con indicatore che scorre */
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
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="tablist" className={cn('relative flex rounded-full bg-surface-2 p-[3px]', className)}>
      <div
        aria-hidden
        className="absolute top-[3px] bottom-[3px] left-[3px] rounded-full bg-elevated shadow-[0_3px_8px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)] transition-transform duration-[420ms] ease-[var(--ease-spring)]"
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative z-10 h-8 min-w-0 flex-1 truncate rounded-full px-1 text-[13px] font-semibold tracking-[-0.01em] transition-colors',
            value === o.value ? 'text-fg' : 'text-muted',
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
    <div className="anim-pop flex flex-col items-center px-8 py-14 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] bg-accent-soft text-accent">{icon}</div>
      <h3 className="text-[20px] font-semibold">{title}</h3>
      {text && <p className="mt-1.5 max-w-xs text-[15px] leading-snug text-muted">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block px-4 text-[13px] text-muted uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block px-4 text-[13px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full h-12 rounded-[14px] bg-surface px-4 text-[17px] outline-none ring-accent/60 focus:ring-2 placeholder:text-faint transition-shadow';

/** Interruttore iOS */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-300', checked ? 'bg-accent' : 'bg-surface-3')}
    >
      <span
        className={cn(
          'absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)] transition-transform duration-[380ms] ease-[var(--ease-spring)]',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-muted', className)}>
      {children}
    </span>
  );
}

// --- Liste raggruppate stile Impostazioni iOS ---

export function Group({
  header,
  footer,
  children,
  className,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('px-4', className)}>
      {header && <h2 className="mb-1.5 px-4 text-[13px] text-muted uppercase">{header}</h2>}
      <div className="overflow-hidden rounded-[22px] bg-surface">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[13px] leading-snug text-muted">{footer}</p>}
    </section>
  );
}

/** Icona quadrata colorata come nelle Impostazioni */
export function RowIcon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-accent text-accent-ink', className)}>
      {children}
    </span>
  );
}

export function Row({
  icon,
  title,
  subtitle,
  value,
  right,
  onClick,
  chevron,
  destructive,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  className?: string;
}) {
  const content = (
    <>
      {icon}
      <div className="flex min-h-[50px] min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 [.group-row:not(:last-child)_&]:shadow-[inset_0_-0.5px_0_var(--border)]">
        <div className="min-w-0 flex-1">
          <div className={cn('truncate text-[17px]', destructive && 'text-danger')}>{title}</div>
          {subtitle && <div className="truncate text-[13px] text-muted">{subtitle}</div>}
        </div>
        {value != null && <span className="num shrink-0 text-[17px] text-muted">{value}</span>}
        {right}
        {(chevron ?? !!onClick) && !right && <IconChevronRight size={18} strokeWidth={2.4} className="shrink-0 text-faint" />}
      </div>
    </>
  );
  const cls = cn('group-row flex w-full items-center gap-3 pl-4 text-left', className);
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, 'tap-row')}>
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
  );
}

/** Titolo di sezione dentro una schermata */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between px-5 pt-6 pb-2">
      <h2 className="text-[22px] leading-7 font-bold">{children}</h2>
      {action}
    </div>
  );
}
