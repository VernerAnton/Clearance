// The side-panel layout stacks the code and the chat. Whichever one you're using is "big"
// (about 80% of the height); clicking or tabbing into the other one swaps them.
export interface PaneProps {
  size: 'big' | 'small';
  onActivate: () => void;
}

// Swapping changes what's under the pointer, so it waits for the click to finish: swapping
// on press would move the button you're pressing, and the click would miss it. Focus that
// comes from a press is ignored for the same reason; focus from the keyboard (Tab) swaps.
let pointerDown = false;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => (pointerDown = true), true);
  const release = () => setTimeout(() => (pointerDown = false));
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
}

/** Attributes for a pane's root element. Without a pane (the full layout) it adds nothing. */
export function paneAttrs(pane: PaneProps | undefined) {
  if (!pane) return {};
  return {
    'data-pane': pane.size,
    onClickCapture: pane.onActivate,
    onFocusCapture: () => {
      if (!pointerDown) pane.onActivate();
    },
  };
}
