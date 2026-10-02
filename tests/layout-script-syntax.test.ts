import { describe, it, expect } from 'vitest';
import { renderLayout } from '../src/views/layout';

// Same guard as chat-script-syntax: one bad escape inside the layout global
// script kills every interactive feature on the site.
describe('layout inline scripts', () => {
  const html = renderLayout({
    user: null,
    rooms: [],
    title: 'test',
    body: '<p>hi</p>',
    csrfToken: 'tok',
  });

  it('every attribute-less <script> block parses as valid JS', () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) {
      expect(() => new Function(s)).not.toThrow();
    }
  });

  it('emits the bot panel delegation handlers and styles', () => {
    expect(html).toContain('data-bot-branch');
    expect(html).toContain('data-bot-copy');
    expect(html).toContain('.bot-panel');
  });

  it('renders Markdown previews through the server renderer for media parity', () => {
    expect(html).toContain("fetch('/api/render'");
    expect(html).toContain("'Content-Type': 'application/json'");
    expect(html).toContain('if (response.redirected)');
    expect(html).not.toContain("preview.innerHTML = marked.parse(ta.value)");
  });

  it('uploads pasted or dropped images without intercepting ordinary text', () => {
    expect(html).toContain("document.body.addEventListener('paste'");
    expect(html).toContain("document.body.addEventListener('dragover'");
    expect(html).toContain("document.body.addEventListener('drop'");
    expect(html).toContain('getUploadComposer(evt.target)');
    expect(html).toContain('getUploadButtons(target.id).length');
    expect(html).toContain('getTransferImageFiles(evt.clipboardData)');
    expect(html).toContain('getTransferImageFiles(evt.dataTransfer)');
    expect(html).toContain('hasTransferImage(evt.dataTransfer)');
    expect(html).toContain("return item.kind === 'file';");
    expect(html).toContain('var imageUploadQueues = {};');
    expect(html).toContain('queueImageUpload(textarea.id, files[i])');
    expect(html).toContain("textarea.setAttribute('aria-busy', 'true')");
    expect(html).toContain("textarea.removeAttribute('aria-busy')");
    expect(html).toContain('if (!files.length) return;');
    expect(html).toContain('return uploadImageFile(id, file)');

    const pasteHandler = html.slice(html.indexOf("document.body.addEventListener('paste'"));
    expect(pasteHandler.indexOf('if (!files.length) return;'))
      .toBeLessThan(pasteHandler.indexOf('evt.preventDefault();'));

    const dropHandler = html.slice(html.indexOf("document.body.addEventListener('drop'"));
    expect(dropHandler.indexOf('if (!files.length) return;'))
      .toBeLessThan(dropHandler.indexOf('evt.preventDefault();'));
  });

  it('duplicates only Markdown-safe selected URLs into the link destination', () => {
    const inlineScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      .map(match => match[1]!)
      .find(script => script.includes('function insertMd('));
    expect(inlineScript).toBeDefined();

    const functionStart = inlineScript!.indexOf('function insertMd(');
    const bodyStart = inlineScript!.indexOf('{', functionStart);
    expect(bodyStart).toBeGreaterThan(functionStart);
    let depth = 0;
    let functionEnd = -1;
    for (let i = bodyStart; i < inlineScript!.length; i++) {
      if (inlineScript![i] === '{') depth++;
      if (inlineScript![i] === '}') {
        depth--;
        if (depth === 0) {
          functionEnd = i + 1;
          break;
        }
      }
    }
    expect(functionEnd).toBeGreaterThan(bodyStart);
    const insertMdSource = inlineScript!.slice(functionStart, functionEnd);

    const applyLink = (selected: string) => {
      const textarea = {
        value: selected,
        selectionStart: 0,
        selectionEnd: selected.length,
        focus() {},
      };
      const documentStub = {
        getElementById(id: string) {
          return id === 'body' ? textarea : null;
        },
      };
      const insertMd = new Function(
        'document',
        insertMdSource + '\nreturn insertMd;',
      )(documentStub) as (id: string, before: string, after: string) => void;

      insertMd('body', '[', '](url)');
      return textarea.value;
    };

    expect(applyLink('https://example.com/path'))
      .toBe('[https://example.com/path](https://example.com/path)');
    expect(applyLink('https://example.com/a b'))
      .toBe('[https://example.com/a b](url)');
    expect(applyLink('https://example.com/a)'))
      .toBe('[https://example.com/a)](url)');
    expect(applyLink('ftp://example.com')).toBe('[ftp://example.com](url)');
    expect(applyLink('Example')).toBe('[Example](url)');
  });
});

// JSON.stringify() never escapes "<", so a title/author containing a literal
// "</script>" can close an application/ld+json block early and inject live
// markup. The plain-<script> guard above never covered this attributed sink.
describe('layout JSON-LD scripts', () => {
  it('escapes "</script>" and "<" so JSON-LD blocks cannot break out', () => {
    const html = renderLayout({
      user: null,
      rooms: [],
      title: 'test',
      body: '<p>hi</p>',
      csrfToken: 'tok',
      jsonLd: JSON.stringify({ headline: '</script><script>alert(1)</script>' }),
    });
    const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map(m => m[1]!);
    expect(ldBlocks.length).toBeGreaterThanOrEqual(2); // site-wide + the injected one
    for (const block of ldBlocks) {
      expect(block).not.toMatch(/<\/script>/i);
      expect(block).not.toMatch(/<script/i);
      const restored = block.replace(/\\u003c/g, '<');
      expect(() => JSON.parse(restored)).not.toThrow();
    }
  });
});
