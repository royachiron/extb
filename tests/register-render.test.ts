import { localizeHtml } from '../src/lib/localization';
import { describe, expect, it } from 'vitest';
import { renderRegister as renderRegisterRaw } from '../src/views/auth';
import { renderLayout } from '../src/views/layout';
const renderRegister = (...args: Parameters<typeof renderRegisterRaw>) => localizeHtml(renderRegisterRaw(...args), 'en');

describe('register form rendering', () => {
  it('renders disabled submit, TOS field, and flexible Turnstile widget', () => {
    const html = renderRegister({ csrfToken: 'csrf-token', siteKey: 'site-key' });

    expect(html).toContain('id="register-submit"');
    expect(html).toContain('disabled>Create Account</button>');
    expect(html).toContain('name="tos_accepted_version"');
    expect(html).toContain('class="cf-turnstile"');
    expect(html).toContain('data-sitekey="site-key"');
    expect(html).toContain('data-size="flexible"');
  });

  it('leaves auth fragments without repeated Turnstile script tags', () => {
    const html = renderRegister({ csrfToken: 'csrf-token', siteKey: 'site-key' });

    expect(html).not.toContain('challenges.cloudflare.com/turnstile/v0/api.js');
  });
});

describe('layout register initialization', () => {
  it('initializes register controls and explicit Turnstile rendering after HTMX swaps', () => {
    const html = renderLayout({ user: null, rooms: [], title: 'Register', body: '' });

    expect(html).toContain('function initRegisterForm');
    expect(html).toContain('function initTurnstile');
    expect(html).toContain('render=explicit');
    expect(html).toContain('htmx:afterSwap');
    expect(html).toContain('initRegisterForm(evt.target');
    expect(html).toContain('initTurnstile(evt.target');
  });
});
