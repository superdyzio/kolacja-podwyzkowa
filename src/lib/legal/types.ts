// The shape of a DRAFT legal document (landing-legal, S-30): numbered sections rendered by one Astro component. Every
// `[…]` in a text is a placeholder the operator fills after the legal review (rendered marked). Pure.

export interface LegalSection {
  // The anchor (`#legal-<id>`) and the smoke's marker (`data-legal-section`); the same ids, in the same order, in both
  // languages (legal.test.ts).
  readonly id: string;
  readonly heading: string;
  // Paragraphs before the list.
  readonly paragraphs: readonly string[];
  readonly items?: readonly string[];
  // Paragraphs after the list.
  readonly closing?: readonly string[];
}

export interface LegalDocument {
  readonly pageTitle: string;
  readonly heading: string;
  readonly draft: string;
  readonly draftText: string;
  readonly asOf: (date: string) => string;
  readonly tocLabel: string;
  readonly otherDocument: string;
  readonly backHome: string;
  readonly sections: readonly LegalSection[];
}
