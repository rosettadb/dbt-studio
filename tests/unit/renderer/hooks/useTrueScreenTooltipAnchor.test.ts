import React from 'react';
import { renderHook } from '@testing-library/react';

// jsdom has no DOMRect (Chromium does), so give the tests a minimal one
if (typeof DOMRect === 'undefined') {
  (window as unknown as { DOMRect: unknown }).DOMRect = class {
    x: number;

    y: number;

    width: number;

    height: number;

    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }
  };
}

// The hook decides once, when it loads, whether this Chromium reports zoomed
// positions, so each test loads a fresh copy (sharing this file's React, so
// its hooks run in the same renderer).
const loadHook = () => {
  let hook: typeof import('../../../../src/renderer/hooks/useTrueScreenTooltipAnchor').useTrueScreenTooltipAnchor;
  jest.isolateModules(() => {
    jest.doMock('react', () => React);
    /* eslint-disable global-require */
    hook =
      require('../../../../src/renderer/hooks/useTrueScreenTooltipAnchor').useTrueScreenTooltipAnchor;
    /* eslint-enable global-require */
  });
  return hook!;
};

// A child inside a page zoomed by `zoom`, which reports its position divided
// by the zoom, as Chromium before 128 does.
const buildZoomedChild = (zoom: string) => {
  const page = document.createElement('div');
  const child = document.createElement('button');
  page.appendChild(child);
  document.body.appendChild(page);
  child.getBoundingClientRect = () => new DOMRect(100, 40, 20, 10);
  jest.spyOn(window, 'getComputedStyle').mockImplementation(
    (element) =>
      ({
        getPropertyValue: (property: string) =>
          property === 'zoom' && element === page ? zoom : '',
      }) as CSSStyleDeclaration,
  );
  return child;
};

const anchorRectFor = (child: HTMLButtonElement) => {
  const useTrueScreenTooltipAnchor = loadHook();
  const { result } = renderHook(() =>
    useTrueScreenTooltipAnchor<HTMLButtonElement>(),
  );
  (result.current.ref as { current: HTMLButtonElement }).current = child;
  return {
    rect: result.current.anchor.getBoundingClientRect(),
    contextElement: result.current.anchor.contextElement,
  };
};

describe('useTrueScreenTooltipAnchor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
    delete (Element.prototype as { currentCSSZoom?: number }).currentCSSZoom;
  });

  it('multiplies the position back by the page zoom', () => {
    const child = buildZoomedChild('1.25');

    const { rect, contextElement } = anchorRectFor(child);

    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([
      125, 50, 25, 12.5,
    ]);
    expect(contextElement).toBe(child);
  });

  it('leaves the position alone on an unzoomed page', () => {
    const child = buildZoomedChild('');

    const { rect } = anchorRectFor(child);

    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([
      100, 40, 20, 10,
    ]);
  });

  it('switches off on Chromium 128+, which reports true positions', () => {
    Object.defineProperty(Element.prototype, 'currentCSSZoom', {
      value: 1,
      configurable: true,
    });
    const child = buildZoomedChild('1.25');

    const { rect } = anchorRectFor(child);

    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([
      100, 40, 20, 10,
    ]);
  });
});
