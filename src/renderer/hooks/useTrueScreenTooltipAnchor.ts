import React from 'react';

// The Dashboard scales its page with CSS zoom to fit the window. Chromium
// before 128 (Electron 31) reports positions inside a zoomed page divided by
// the zoom, so a tooltip there would aim at the wrong spot. Chromium 128+
// reports true positions and has Element.currentCSSZoom, so the correction
// switches itself off there.
const reportsZoomedPositions =
  typeof Element !== 'undefined' && !('currentCSSZoom' in Element.prototype);

export const getTrueScreenRect = (element: Element): DOMRect => {
  const rect = element.getBoundingClientRect();
  if (!reportsZoomedPositions) return rect;
  let zoom = 1;
  for (let node: Element | null = element; node; node = node.parentElement) {
    zoom *= parseFloat(getComputedStyle(node).getPropertyValue('zoom')) || 1;
  }
  if (zoom === 1) return rect;
  return new DOMRect(
    rect.x * zoom,
    rect.y * zoom,
    rect.width * zoom,
    rect.height * zoom,
  );
};

// Put `ref` on a tooltip's child and pass `anchor` as the tooltip's
// slotProps.popper.anchorEl, so the tooltip lines up with the child even on a
// zoomed page.
export const useTrueScreenTooltipAnchor = <T extends Element>() => {
  const ref = React.useRef<T>(null);
  const anchor = React.useMemo(
    () => ({
      getBoundingClientRect: () => getTrueScreenRect(ref.current!),
      get contextElement() {
        return ref.current ?? undefined;
      },
    }),
    [],
  );
  return { ref, anchor };
};
