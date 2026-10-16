import { describe, it, expect } from 'vitest';
import { SCRIPT_BOOT } from '../src/views/layout-scripts/boot';

// Runs the real boot script against a tiny fake DOM and drives htmx:afterSwap.
function boot(hash: string) {
  const handlers: Record<string, Function[]> = {};
  const post = { id: hash.slice(1), dataset: {} as Record<string, string> };
  const scrolled: string[] = [];
  const body = {
    classList: { toggle() {} },
    addEventListener(name: string, fn: Function) { (handlers[name] ||= []).push(fn); },
  };
  const document = {
    body,
    querySelector: () => null,
    getElementById: (id: string) => (id === post.id ? post : null),
    addEventListener() {},
  };
  const window = { location: { hash }, addEventListener() {} };
  const noop = () => {};
  new Function(
    'document', 'window', 'updateRelativeTimes', 'updateActiveStates', 'initRegisterForm', 'initTurnstile', 'handleSmoothScroll',
    SCRIPT_BOOT,
  )(document, window, noop, noop, noop, noop, (id: string) => scrolled.push(id));
  const swap = (target: { contains: (el: unknown) => boolean }) =>
    handlers['htmx:afterSwap']!.forEach(fn => fn({ target }));
  return { swap, scrolled, post };
}

describe('hash scroll on htmx swaps', () => {
  it('heartbeat swap (target does not contain the post) does not scroll', () => {
    const { swap, scrolled } = boot('#post-575');
    swap({ contains: () => false });
    swap({ contains: () => false });
    expect(scrolled).toEqual([]);
  });

  it('navigation swap that brings the post in scrolls once, not on later swaps', () => {
    const { swap, scrolled, post } = boot('#post-575');
    const main = { contains: (el: unknown) => el === post };
    swap(main);
    swap(main);
    swap({ contains: () => false });
    expect(scrolled).toEqual(['post-575']);
  });
});
