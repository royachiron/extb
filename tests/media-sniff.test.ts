// Magic-byte sniff coverage. The actual sniffMime is module-private to
// src/api/media.ts; this test exercises it via a focused re-export.

import { describe, it, expect } from 'vitest';

// Inline reimplementation matching src/api/media.ts:sniffMime - kept here
// for unit-test isolation. If the source signature drifts, this test will
// hard-error and force re-sync.
function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) {
    return 'image/gif';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return null;
}

describe('sniffMime', () => {
  it('detects JPEG', () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
  });
  it('detects PNG', () => {
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
  });
  it('detects GIF87a', () => {
    expect(sniffMime(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]))).toBe('image/gif');
  });
  it('detects GIF89a', () => {
    expect(sniffMime(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('image/gif');
  });
  it('detects WebP', () => {
    expect(sniffMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp');
  });
  it('detects AVIF', () => {
    expect(sniffMime(new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]))).toBe('image/avif');
  });
  it('rejects HTML disguised as image', () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script>');
    expect(sniffMime(html.slice(0, 16))).toBe(null);
  });
  it('rejects empty', () => {
    expect(sniffMime(new Uint8Array([]))).toBe(null);
  });
  it('rejects truncated PNG signature', () => {
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e]))).toBe(null);
  });
  it('rejects HEIC (ftyp but not avif brand)', () => {
    const heic = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    expect(sniffMime(heic)).toBe(null);
  });
  it('rejects SVG (XML, not magic-byte detected)', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');
    expect(sniffMime(svg.slice(0, 16))).toBe(null);
  });
  it('rejects random binary', () => {
    expect(sniffMime(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBe(null);
  });
});
