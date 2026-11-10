// The public pages of the platform (landing-legal, S-30; FR-041): the product page and the two DRAFT legal documents.
// Polish, untranslated slugs like /logowanie (English through the language switch, `?lang=en`). Pure.

export const HOME_PATH = "/";
export const TERMS_PATH = "/regulamin";
export const PRIVACY_POLICY_PATH = "/polityka-prywatnosci";

// The day the drafts describe the app as it is (shown as „Stan na …” on both documents).
export const LEGAL_DRAFT_DATE = "2026-11-10";

// Headers of both drafts until the legal review: never cached (the language comes from a cookie) and never indexed
// (every page also carries the Layout's `noindex` meta; the header says it for non-HTML-aware crawlers too).
export const LEGAL_DRAFT_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};
