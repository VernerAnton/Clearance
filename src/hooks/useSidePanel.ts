import { useEffect, useState } from 'react';
import type { LayoutMode } from '../lib/settings';

/** Below this window width, "Automatic" switches to the side-panel layout. */
export const SIDE_PANEL_MAX_WIDTH = 700;
const QUERY = `(max-width: ${SIDE_PANEL_MAX_WIDTH}px)`;

/** True when the app should use the narrow side-panel layout. Follows window resizes in Automatic. */
export function useSidePanel(mode: LayoutMode): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = () => setNarrow(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return mode === 'side' || (mode === 'auto' && narrow);
}
