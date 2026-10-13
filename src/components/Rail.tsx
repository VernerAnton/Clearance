import { useRef, type KeyboardEvent } from 'react';
import { LEVELS, MODES, levelInfo, modeById, type Level, type ModeId } from '../../shared/clearance';
import type { Settings, Theme } from '../lib/settings';

interface Props {
  mode: ModeId;
  level: Level;
  resetNote: string;
  settings: Settings;
  onMode: (mode: ModeId) => void;
  onLevel: (level: Level) => void;
  onNewMission: () => void;
  onSettings: (settings: Settings) => void;
}

export function Rail({ mode, level, resetNote, settings, onMode, onLevel, onNewMission, onSettings }: Props) {
  const current = modeById(mode);
  const laddersOn = current.hasLevels;
  const rungRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow keys move between rungs, like any radio group.
  const onLadderKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.min(5, Math.max(1, level + step)) as Level;
    onLevel(next);
    rungRefs.current[next - 1]?.focus();
  };

  return (
    <aside className="rail">
      <div className="brand">
        <h1>
          Clearance<span className="slashes">//</span>
        </h1>
        <p>Coding tutor. You pick how much help; the app enforces it.</p>
      </div>

      <section>
        <h2 id="mode-h">Mode</h2>
        <div className="modes" role="group" aria-labelledby="mode-h">
          {MODES.map((m) => (
            <button key={m.id} type="button" className="mode" aria-pressed={m.id === mode} onClick={() => onMode(m.id)}>
              <span aria-hidden="true">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
        <p className="hint">{current.plain}.</p>
      </section>

      <section>
        <h2 id="level-h">Clearance for your next message</h2>
        <div
          className={`ladder${laddersOn ? '' : ' off'}`}
          role="radiogroup"
          aria-labelledby="level-h"
          aria-disabled={!laddersOn}
          onKeyDown={laddersOn ? onLadderKey : undefined}
        >
          {LEVELS.map((l) => {
            const checked = laddersOn && l.level === level;
            return (
              <button
                key={l.level}
                ref={(el) => {
                  rungRefs.current[l.level - 1] = el;
                }}
                type="button"
                role="radio"
                className="rung"
                aria-checked={checked}
                tabIndex={laddersOn && l.level === level ? 0 : -1}
                disabled={!laddersOn}
                onClick={() => onLevel(l.level)}
              >
                <span className="rung-num" aria-hidden="true">
                  {l.level}
                </span>
                <span className="rung-text">
                  <span className="rung-name">
                    <span className="sr">Clearance {l.level}: </span>
                    {l.name}
                  </span>
                  <span className="rung-plain">{l.plain}</span>
                </span>
              </button>
            );
          })}
        </div>
        {laddersOn ? (
          <p className="hint">
            Next reply at <strong>Clearance {level}: {levelInfo(level).name}</strong>. Resets to 1 after every message.
          </p>
        ) : (
          <p className="hint">Explain mode has no clearance levels.</p>
        )}
        <p className="reset-note" aria-live="polite">
          {resetNote}
        </p>
      </section>

      <section>
        <button type="button" className="btn" onClick={onNewMission}>
          New mission
        </button>
        <p className="hint">Clears the chat. Your tabs stay.</p>
      </section>

      <section>
        <h2>Settings</h2>
        <div className="settings">
          {(
            [
              ['liveLinting', 'Live linting', 'Underlines syntax errors while you type.'],
              ['autocomplete', 'Autocomplete', 'Suggests names and keywords while you type.'],
              ['closeBrackets', 'Auto-close brackets', 'Typing ( [ { or a quote adds the closing one.'],
            ] as const
          ).map(([key, name, plain]) => (
            <label className="check" key={key}>
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(e) => onSettings({ ...settings, [key]: e.target.checked })}
              />
              <span>
                {name}
                <span className="hint block">{plain}</span>
              </span>
            </label>
          ))}
          <label className="field">
            <span>Theme</span>
            <select value={settings.theme} onChange={(e) => onSettings({ ...settings, theme: e.target.value as Theme })}>
              <option value="system">Same as my computer</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <p className="hint">Drag the lines between panels to resize them. Double-click a line to reset it.</p>
        </div>
      </section>
    </aside>
  );
}
