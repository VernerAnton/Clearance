import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { JUDGE_MODELS, TUTOR_MODELS, type ModelOption, type ServerConfig } from '../../shared/models';
import { fetchServerConfig } from '../lib/api';
import type { Thinking } from '../../shared/api';
import type { Settings, Theme } from '../lib/settings';

interface Props {
  open: boolean;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onResetLayout: () => void;
  onClose: () => void;
}

const EDITOR_OPTIONS = [
  ['liveLinting', 'Live linting', 'Underlines syntax errors while you type.'],
  ['autocomplete', 'Autocomplete', 'Suggests names and keywords while you type.'],
  ['closeBrackets', 'Auto-close brackets', 'Typing ( [ { or a quote adds the closing one.'],
] as const;

const THINKING_NOTES: Record<Thinking, string> = {
  low: 'Fastest and cheapest. Fine for everyday hints.',
  medium: 'Slower, more careful. Good for several varied missions.',
  high: 'Slowest and costs the most (thinking is billed). For big or tricky requests.',
};

const labelOf = (list: ModelOption[], id: string | null | undefined) => list.find((m) => m.id === id)?.label ?? id;

function ModelPicker(props: {
  id: string;
  label: string;
  plain: string;
  list: ModelOption[];
  value: string;
  serverDefault: string | null | undefined;
  disabled?: (m: ModelOption) => string | null;
  onChange: (id: string) => void;
}) {
  const { id, label, plain, list, value, serverDefault, disabled, onChange } = props;
  const picked = list.find((m) => m.id === value);
  // undefined: still asking the server; null: the server has no default set.
  const defaultLabel =
    serverDefault === undefined
      ? 'Default'
      : `Default (${serverDefault ? labelOf(list, serverDefault) : 'none set on the server'})`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}>
        <option value="">{defaultLabel}</option>
        {list.map((m) => {
          const why = disabled?.(m);
          return (
            <option key={m.id} value={m.id} disabled={!!why}>
              {m.label}
              {why ? ` (${why})` : ''}
            </option>
          );
        })}
      </select>
      <span className="hint block">{picked ? picked.note : plain}</span>
    </div>
  );
}

/** The settings popup: editor, appearance, models and developer options. */
export function SettingsDialog({ open, settings, onSettings, onResetLayout, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Ask the server which models are its defaults and whether Jev's key exists.
      void fetchServerConfig().then(setConfig);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const set = (patch: Partial<Settings>) => onSettings({ ...settings, ...patch });

  return (
    <dialog
      ref={ref}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onClose={onClose}
      // A click on the dimmed area outside the box closes it.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="settings-body">
        <header>
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </header>

        <section>
          <h3>Editor</h3>
          {EDITOR_OPTIONS.map(([key, name, plain]) => (
            <label className="check" key={key}>
              <input type="checkbox" checked={settings[key]} onChange={(e) => set({ [key]: e.target.checked })} />
              <span>
                {name}
                <span className="hint block">{plain}</span>
              </span>
            </label>
          ))}
        </section>

        <section>
          <h3>Appearance</h3>
          <div className="field">
            <label htmlFor="theme">Theme</label>
            <select id="theme" value={settings.theme} onChange={(e) => set({ theme: e.target.value as Theme })}>
              <option value="system">Same as my computer</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div className="row">
            <button type="button" className="btn small" onClick={onResetLayout}>
              Reset panel sizes
            </button>
            <span className="hint">Or drag the lines between panels; double-click one to reset it.</span>
          </div>
        </section>

        <section>
          <h3>Models</h3>
          <ModelPicker
            id="tutor-model"
            label="Tutor"
            plain="Writes the replies. Default is TUTOR_MODEL on Cloudflare."
            list={TUTOR_MODELS}
            value={settings.tutorModel}
            serverDefault={config?.defaults.tutor}
            onChange={(tutorModel) => set({ tutorModel })}
          />
          <ModelPicker
            id="judge-model"
            label="Judge"
            plain="Checks drafts for spoilers at Clearance 1 and 2. Default is JUDGE_MODEL on Cloudflare."
            list={JUDGE_MODELS}
            value={settings.judgeModel}
            serverDefault={config?.defaults.judge}
            disabled={(m) => (m.id.startsWith('typesafe:') && config && !config.keys.typesafe ? 'needs TYPESAFE_API_KEY' : null)}
            onChange={(judgeModel) => set({ judgeModel })}
          />
          <div className="field">
            <span id="thinking-label">Tutor thinking</span>
            <div className="segmented" role="radiogroup" aria-labelledby="thinking-label">
              {(['low', 'medium', 'high'] as const).map((t) => (
                <label key={t} className={settings.thinking === t ? 'on' : ''}>
                  <input
                    type="radio"
                    name="thinking"
                    value={t}
                    checked={settings.thinking === t}
                    onChange={() => set({ thinking: t })}
                  />
                  {t[0].toUpperCase() + t.slice(1)}
                </label>
              ))}
            </div>
            <span className="hint block">{THINKING_NOTES[settings.thinking]}</span>
          </div>
          <p className="hint">
            Prices are per million tokens, input / output. A message usually costs a fraction of a cent; more thinking costs more.
          </p>
        </section>

        <section>
          <h3>Developer</h3>
          <label className="check">
            <input type="checkbox" checked={settings.debugPanel} onChange={(e) => set({ debugPanel: e.target.checked })} />
            <span>
              Debug panel
              <span className="hint block">Shows what the tutor and the judge receive, which models answered, and any blocked drafts.</span>
            </span>
          </label>
        </section>

        <footer className="hint">Settings are saved in this browser.</footer>
      </div>
    </dialog>
  );
}
