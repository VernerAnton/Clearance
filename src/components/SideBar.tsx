import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { LEVELS, MODES, levelInfo, modeById, type Level, type ModeId } from '../../shared/clearance';
import { APP_VERSION } from '../version';

// The top bar of the side-panel layout. Two notches replace the left rail: one shows the
// mode's emoji, the other the clearance level. Each opens a menu on click or tap, and on
// hover with a mouse.

interface NotchProps {
  label: string;
  /** What the notch shows when closed, e.g. "🐛" or "L1". */
  face: ReactNode;
  /** Changes when the value changes, so the notch can flash (the level reset after sending). */
  flashKey: string;
  menu: (close: () => void) => ReactNode;
}

function Notch({ label, face, flashKey, menu }: NotchProps) {
  const [open, setOpen] = useState(false);
  // Opened by hovering: closes again when the mouse leaves. A click pins it open.
  const [byHover, setByHover] = useState(false);
  const [flash, setFlash] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<number | undefined>(undefined);
  const firstKey = useRef(flashKey);

  const close = () => {
    setOpen(false);
    setByHover(false);
  };

  // Close on a click or tap anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (flashKey === firstKey.current) return;
    firstKey.current = flashKey;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 900);
    return () => window.clearTimeout(t);
  }, [flashKey]);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const onEnter = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(leaveTimer.current);
    if (!open) {
      setOpen(true);
      setByHover(true);
    }
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !byHover) return;
    // A short grace period, so slipping off the edge on the way to the menu doesn't close it.
    leaveTimer.current = window.setTimeout(close, 250);
  };
  const onClick = () => {
    if (open && byHover) setByHover(false);
    else if (open) close();
    else setOpen(true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      close();
      rootRef.current?.querySelector<HTMLButtonElement>('.notch-face')?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (!open) setOpen(true);
    // Arrow keys move through the menu's options.
    requestAnimationFrame(() => {
      const items = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('.notch-menu button:not(:disabled)') ?? [])];
      if (items.length === 0) return;
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = i < 0 ? items.findIndex((b) => b.getAttribute('aria-checked') === 'true') : i + (e.key === 'ArrowDown' ? 1 : -1);
      items[(Math.max(0, next) + items.length) % items.length]?.focus();
    });
  };

  return (
    <div className="notch" ref={rootRef} onPointerEnter={onEnter} onPointerLeave={onLeave} onKeyDown={onKeyDown}>
      <button
        type="button"
        className={`notch-face${flash ? ' flash' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={onClick}
      >
        {face}
        <span className="notch-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="notch-menu" role="menu" aria-label={label}>
          {menu(close)}
        </div>
      )}
    </div>
  );
}

interface Props {
  mode: ModeId;
  level: Level;
  resetNote: string;
  onMode: (mode: ModeId) => void;
  onLevel: (level: Level) => void;
  onNewMission: () => void;
  onOpenSettings: () => void;
}

export function SideBar({ mode, level, resetNote, onMode, onLevel, onNewMission, onOpenSettings }: Props) {
  const current = modeById(mode);
  const hasLevels = current.hasLevels;

  return (
    <header className="sidebar">
      <Notch
        label={`Mode: ${current.label}. ${current.plain}.`}
        face={<span className="notch-emoji">{current.icon}</span>}
        flashKey={mode}
        menu={(close) =>
          MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="menuitemradio"
              aria-checked={m.id === mode}
              onClick={() => {
                onMode(m.id);
                close();
              }}
            >
              <span className="notch-item-icon" aria-hidden="true">
                {m.icon}
              </span>
              <span className="notch-item-text">
                <strong>{m.label}</strong>
                <small>{m.plain}</small>
              </span>
            </button>
          ))
        }
      />
      <Notch
        label={hasLevels ? `Clearance ${level}: ${levelInfo(level).name}, for your next message` : 'Explain mode has no clearance levels'}
        face={<span className="notch-level">{hasLevels ? `L${level}` : 'L–'}</span>}
        flashKey={hasLevels ? String(level) : '-'}
        menu={(close) =>
          hasLevels ? (
            LEVELS.map((l) => (
              <button
                key={l.level}
                type="button"
                role="menuitemradio"
                aria-checked={l.level === level}
                onClick={() => {
                  onLevel(l.level);
                  close();
                }}
              >
                <span className="notch-item-icon notch-num" aria-hidden="true">
                  {l.level}
                </span>
                <span className="notch-item-text">
                  <strong>{l.name}</strong>
                  <small>{l.plain}</small>
                </span>
              </button>
            ))
          ) : (
            <p className="notch-empty">Explain mode has no clearance levels.</p>
          )
        }
      />
      <p className="sidebar-note" aria-live="polite">
        {resetNote ? 'Reset to L1' : ''}
      </p>
      <span className="sidebar-version" title={`Build ${__BUILD_COMMIT__}, ${__BUILD_TIME__}`}>
        V{APP_VERSION}
      </span>
      <button type="button" className="btn small" onClick={onNewMission} title="New mission: clears the chat, your tabs stay">
        New
      </button>
      <button type="button" className="btn small sidebar-settings" onClick={onOpenSettings} aria-label="Settings" title="Settings">
        ⚙
      </button>
    </header>
  );
}
