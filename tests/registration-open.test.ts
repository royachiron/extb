import { describe, expect, it, vi } from 'vitest';
import { isRegistrationOpen } from '../src/api/auth';

const dbMocks = vi.hoisted(() => ({
  getSetting: vi.fn(),
}));

vi.mock('../src/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/db');
  return { ...actual, getSetting: dbMocks.getSetting };
});

describe('isRegistrationOpen', () => {
  it('defaults to closed without an email provider', async () => {
    dbMocks.getSetting.mockResolvedValue(null);

    await expect(isRegistrationOpen({} as any)).resolves.toBe(false);
  });

  it('closes registration only when signups_open is 0', async () => {
    dbMocks.getSetting.mockResolvedValue({ key: 'signups_open', value: '0' });

    await expect(isRegistrationOpen({} as any)).resolves.toBe(false);
  });
});
