import { APP_VERSION } from '../version';

interface Props {
  onReload: () => void;
  onDismiss: () => void;
}

/** "A newer version is ready": offered, never forced. */
export function UpdatePrompt({ onReload, onDismiss }: Props) {
  return (
    <div className="update-prompt" role="status">
      <div className="update-text">
        <strong>A newer version is ready.</strong>
        <span className="hint block">You're on V{APP_VERSION}. Reloading keeps your tabs and settings.</span>
      </div>
      <div className="update-actions">
        <button type="button" className="btn small" onClick={onDismiss}>
          Later
        </button>
        <button type="button" className="btn small primary" onClick={onReload}>
          Reload
        </button>
      </div>
    </div>
  );
}
