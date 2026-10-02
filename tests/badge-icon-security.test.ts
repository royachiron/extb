import { describe, expect, it } from 'vitest';
import { renderBadgeIcon } from '../src/lib/badges';
describe('badge icons cannot execute administrator-supplied markup', () => {
  it('escapes SVG and rejects executable data formats', () => {
    expect(renderBadgeIcon('<svg onload="alert(1)"></svg>')).not.toContain('<svg');
    expect(renderBadgeIcon('data:image/svg+xml,<svg onload="alert(1)"/>')).not.toContain('<img');
    expect(renderBadgeIcon('data:image/png;base64,abc" onerror="alert(1)')).not.toContain('<img');
  });
  it('renders an encoded raster icon and emoji', () => {
    expect(renderBadgeIcon('data:image/png;base64,YWJj')).toContain('<img');
    expect(renderBadgeIcon('🏅')).toBe('🏅');
  });
});
