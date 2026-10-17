import { describe, expect, it } from 'vitest';
import { draftPrompt, makeCommunityDraft, parseDraftText } from '../src/community/draft';

describe('bring-your-own-AI starter prompt', () => {
  const he = makeCommunityDraft({ name: 'בחירות 2026', purpose: 'דיונים על הבחירות', preset: 'general', language: 'he' });
  const en = makeCommunityDraft({ name: 'Retro Synth Club', purpose: 'Trading synth patches', preset: 'club', language: 'en' });

  it('writes the prompt in the forum language with editable preferences, hard rules and the current draft', () => {
    const hebrew = draftPrompt(he);
    expect(hebrew).toContain('ההעדפות שלי');
    expect(hebrew).toContain('announcements, introductions, general, questions, resources, chat');
    expect(hebrew).toContain(JSON.stringify(he, null, 2));
    const english = draftPrompt(en);
    expect(english).toContain('My preferences');
    expect(english).toContain('Do not invent members');
    expect(english).toContain(JSON.stringify(en, null, 2));
  });

  it('accepts an assistant reply wrapped in prose and code fences', () => {
    const edited = { ...en, homepageCopy: 'Patches, tips and gear talk.' };
    const reply = 'Sure! Here is the updated JSON:\n```json\n' + JSON.stringify(edited, null, 2) + '\n```\nLet me know if you want changes.';
    expect(parseDraftText(reply)).toEqual(edited);
  });

  it('rejects replies that break the forum format', () => {
    expect(() => parseDraftText('I cannot help with that.')).toThrow();
    const reordered = { ...en, rooms: [...en.rooms].reverse() };
    expect(() => parseDraftText(JSON.stringify(reordered))).toThrow();
    expect(() => parseDraftText(JSON.stringify({ ...en, permissions: { read: 'admin' } }))).toThrow();
    expect(() => parseDraftText(JSON.stringify({ ...en, discussions: en.discussions.slice(0, 2) }))).toThrow();
  });
});
