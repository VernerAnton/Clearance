import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { clamp } from '../lib/layout';

interface Props {
  /** 'x': drag left/right (between columns). 'y': drag up/down. */
  axis: 'x' | 'y';
  label: string;
  value: number;
  /** +1 if dragging right/down makes the value bigger, -1 if it makes it smaller. */
  grow: 1 | -1;
  /** Allowed range, worked out when a drag starts (it depends on the window size). */
  bounds: () => { min: number; max: number };
  onChange: (value: number) => void;
  /** Double-click puts the default size back. */
  onReset: () => void;
  className?: string;
}

const KEY_STEP = 16;

/** A thin bar you can drag (or focus and use arrow keys on) to resize a panel. */
export function Splitter({ axis, label, value, grow, bounds, onChange, onReset, className }: Props) {
  const drag = useRef<{ start: number; value: number; min: number; max: number } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { min, max } = bounds();
    drag.current = { start: axis === 'x' ? e.clientX : e.clientY, value: clamp(value, min, max), min, max };
    // While dragging, don't select text and keep the resize cursor everywhere.
    document.body.classList.add('resizing', `resizing-${axis}`);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const moved = (axis === 'x' ? e.clientX : e.clientY) - d.start;
    onChange(clamp(d.value + moved * grow, d.min, d.max));
  };

  const endDrag = () => {
    drag.current = null;
    document.body.classList.remove('resizing', 'resizing-x', 'resizing-y');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const forward = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    if (e.key !== forward && e.key !== back) return;
    e.preventDefault();
    const step = (e.shiftKey ? KEY_STEP * 4 : KEY_STEP) * (e.key === forward ? 1 : -1) * grow;
    const { min, max } = bounds();
    onChange(clamp(value + step, min, max));
  };

  return (
    <div
      className={`splitter splitter-${axis}${className ? ` ${className}` : ''}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={value}
      tabIndex={0}
      title={`${label}. Drag to resize, double-click to reset.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
