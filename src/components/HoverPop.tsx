import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

export type HoverPopPlacement = 'top' | 'bottom' | 'right' | 'left';

interface HoverPopProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  as?: 'div' | 'span';
  placement?: HoverPopPlacement;
  widthClass?: string;
  delayMs?: number;
  disabled?: boolean;
}

interface PopCoords {
  top: number;
  left: number;
  resolvedPlacement: HoverPopPlacement;
}

export function HoverPop({
  content,
  children,
  className = '',
  as = 'div',
  placement = 'top',
  widthClass = 'w-72',
  delayMs = 80,
  disabled = false,
}: HoverPopProps) {
  const triggerRef = useRef<HTMLDivElement | HTMLSpanElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopCoords>({
    top: -9999,
    left: -9999,
    resolvedPlacement: placement,
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hidePop = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  const showPop = useCallback(() => {
    if (disabled || !content) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(hover: none)').matches
    ) {
      return;
    }
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      setOpen(true);
    }, delayMs);
  }, [clearTimer, content, delayMs, disabled]);

  useEffect(() => {
    if (disabled) {
      hidePop();
    }
    return () => clearTimer();
  }, [disabled, hidePop, clearTimer]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => setOpen(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !popRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popRect = popRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;
    const gap = 10;

    let resolved = placement;
    let top = 0;
    let left = 0;

    if (placement === 'top' || placement === 'bottom') {
      const fitsTop = triggerRect.top - popRect.height - gap >= margin;
      const fitsBottom = triggerRect.bottom + popRect.height + gap <= vh - margin;

      if (placement === 'top') {
        resolved = fitsTop || !fitsBottom ? 'top' : 'bottom';
      } else {
        resolved = fitsBottom || !fitsTop ? 'bottom' : 'top';
      }

      top =
        resolved === 'top'
          ? triggerRect.top - popRect.height - gap
          : triggerRect.bottom + gap;
      left = triggerRect.left + triggerRect.width / 2 - popRect.width / 2;
    } else {
      const fitsRight = triggerRect.right + popRect.width + gap <= vw - margin;
      const fitsLeft = triggerRect.left - popRect.width - gap >= margin;

      if (placement === 'right') {
        resolved = fitsRight || !fitsLeft ? 'right' : 'left';
      } else {
        resolved = fitsLeft || !fitsRight ? 'left' : 'right';
      }

      left =
        resolved === 'right'
          ? triggerRect.right + gap
          : triggerRect.left - popRect.width - gap;
      top = triggerRect.top + triggerRect.height / 2 - popRect.height / 2;
    }

    // Clamp to viewport bounds so popup never clips off screen
    left = Math.max(margin, Math.min(left, vw - popRect.width - margin));
    top = Math.max(margin, Math.min(top, vh - popRect.height - margin));

    setCoords({ top, left, resolvedPlacement: resolved });
  }, [open, placement, content]);

  const setRef = useCallback((node: HTMLDivElement | HTMLSpanElement | null) => {
    triggerRef.current = node;
  }, []);

  const portalNode =
    open && content && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popRef}
            role="tooltip"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
            }}
            className={`fixed z-[70] pointer-events-none ${widthClass} max-w-[calc(100vw-24px)] kazyfi-pop-card`}
          >
            <div className="bg-white/98 dark:bg-[#151E30]/98 text-slate-900 dark:text-slate-100 border border-slate-200/95 dark:border-slate-700/90 rounded-xl shadow-[0_18px_40px_-12px_rgba(14,24,54,0.28)] dark:shadow-[0_18px_42px_-12px_rgba(0,0,0,0.75)] p-3.5 backdrop-blur-md">
              {content}
            </div>
          </div>,
          document.body
        )
      : null;

  const WrapperTag = as;

  return (
    <>
      <WrapperTag
        ref={setRef}
        className={className}
        onMouseEnter={showPop}
        onMouseLeave={hidePop}
        onMouseDown={hidePop}
        onFocus={showPop}
        onBlur={hidePop}
      >
        {children}
      </WrapperTag>
      {portalNode}
    </>
  );
}
