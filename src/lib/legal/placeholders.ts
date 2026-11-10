// Placeholders in the DRAFT legal documents (landing-legal, S-30): every `[…]` (no nested brackets) is something only
// the operator and a lawyer can decide — the operator's identity, a contact, a legal basis, a price. The pages render
// them marked (`<mark data-legal-placeholder>`), so nobody mistakes a draft for the final text. Pure.

const PLACEHOLDER = /\[[^[\]]+\]/g;

export interface TextSegment {
  readonly text: string;
  readonly placeholder: boolean;
}

// The text cut into plain and placeholder segments, in order; no empty segment. An unclosed `[` stays plain text.
export function splitPlaceholders(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    const start = match.index;
    if (start > last) {
      segments.push({ text: text.slice(last, start), placeholder: false });
    }
    segments.push({ text: match[0], placeholder: true });
    last = start + match[0].length;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last), placeholder: false });
  }
  return segments;
}

// Every placeholder of the text, in order (repeats kept).
export function placeholdersOf(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[0]);
}
