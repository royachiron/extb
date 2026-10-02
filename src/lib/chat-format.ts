// Shared chat text formatting used by both delivery paths (WS DO + HTTP poll).

const EXCERPT_LEN = 100;

// Reply excerpt: collapse newlines/runs of whitespace to single spaces, trim to
// EXCERPT_LEN. Both the DO and api/chat.ts use this one function so a reply
// looks the same whoever wrote it.
export function chatReplyExcerpt(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, EXCERPT_LEN);
}
