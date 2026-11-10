import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { INVITE_TTL_DAYS, PASSWORD_MIN_LENGTH, RESET_TTL_HOURS, SESSION_DAYS } from "@/lib/auth/limits";
import { WAITER_COOKIE } from "@/lib/event-waiters/cookie";
import { LOCALE_COOKIE_MAX_AGE_SECONDS, LOCALES, localeCookieName, type Locale } from "@/lib/i18n/locale";
import { PRODUCT_NAME } from "@/lib/i18n/product";
import { modulesMessages } from "@/lib/modules/messages";
import { PAID_MODULES } from "@/lib/modules/rules";
import { DEFAULT_GUEST_RETENTION_DAYS, MAX_GUEST_RETENTION_DAYS, MIN_GUEST_RETENTION_DAYS } from "@/lib/privacy/rules";
import { SUPPORT_MINUTES } from "@/lib/support/rules";
import { landingMessages, legalLinksMessages } from "./landing";
import { LEGAL_DRAFT_HEADERS, PRIVACY_POLICY_PATH, TERMS_PATH } from "./paths";
import { placeholdersOf, splitPlaceholders } from "./placeholders";
import { privacyPolicyMessages } from "./privacy-policy";
import { termsMessages } from "./terms";
import type { LegalDocument, LegalSection } from "./types";

// landing-legal (S-30; FR-041): the product page and the DRAFT terms and privacy policy. The drafts must stay honest
// (the numbers and cookie names of the code), complete in both languages, clearly drafts, and free of anything only the
// operator may decide (an e-mail address, an external link); the product's working name only through PRODUCT_NAME.

const DOCUMENTS = { terms: termsMessages, privacy: privacyPolicyMessages } as const;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const URL = /https?:\/\//;

function sectionTexts(section: LegalSection): string[] {
  return [section.heading, ...section.paragraphs, ...(section.items ?? []), ...(section.closing ?? [])];
}

function documentText(doc: LegalDocument): string {
  return [
    doc.pageTitle,
    doc.heading,
    doc.draft,
    doc.draftText,
    doc.asOf("2026-11-10"),
    doc.tocLabel,
    doc.otherDocument,
    doc.backHome,
    ...doc.sections.flatMap(sectionTexts),
  ].join("\n");
}

function landingText(locale: Locale): string {
  return JSON.stringify({ landing: landingMessages(locale), links: legalLinksMessages(locale) });
}

describe("placeholders", () => {
  it("splits a text into plain and placeholder segments, in order", () => {
    expect(splitPlaceholders("bez pól")).toEqual([{ text: "bez pól", placeholder: false }]);
    expect(splitPlaceholders("NIP [NIP].")).toEqual([
      { text: "NIP ", placeholder: false },
      { text: "[NIP]", placeholder: true },
      { text: ".", placeholder: false },
    ]);
    expect(splitPlaceholders("[a][b] i [c]")).toEqual([
      { text: "[a]", placeholder: true },
      { text: "[b]", placeholder: true },
      { text: " i ", placeholder: false },
      { text: "[c]", placeholder: true },
    ]);
    expect(splitPlaceholders("")).toEqual([]);
  });

  it("leaves an unclosed or empty bracket as plain text", () => {
    expect(splitPlaceholders("otwarty [nawias")).toEqual([{ text: "otwarty [nawias", placeholder: false }]);
    expect(splitPlaceholders("pusty []")).toEqual([{ text: "pusty []", placeholder: false }]);
  });

  it("lists every placeholder with repeats", () => {
    expect(placeholdersOf("[x] i [y], znowu [x]")).toEqual(["[x]", "[y]", "[x]"]);
    expect(placeholdersOf("nic")).toEqual([]);
  });
});

describe.each(Object.entries(DOCUMENTS))("the %s draft", (_kind, messages) => {
  const pl = messages("pl");
  const en = messages("en");

  it("has the same sections, in the same order, in both languages", () => {
    expect(pl.sections.length).toBeGreaterThan(5);
    expect(en.sections.map((section) => section.id)).toEqual(pl.sections.map((section) => section.id));
    expect(new Set(pl.sections.map((section) => section.id)).size).toBe(pl.sections.length);
  });

  it("gives every section a heading and some content", () => {
    for (const doc of [pl, en]) {
      for (const section of doc.sections) {
        expect(section.heading.trim()).not.toBe("");
        expect(section.paragraphs.length + (section.items?.length ?? 0)).toBeGreaterThan(0);
        expect(sectionTexts(section).every((text) => text.trim() !== "")).toBe(true);
      }
    }
  });

  it("has as many placeholders per section in English as in Polish", () => {
    pl.sections.forEach((section, index) => {
      const count = (s: LegalSection) => placeholdersOf(sectionTexts(s).join("\n")).length;
      expect([section.id, count(en.sections[index])]).toEqual([section.id, count(section)]);
    });
  });

  it("is marked as a draft for legal review", () => {
    expect(pl.draft).toBe("Wersja robocza — do przeglądu prawnika");
    expect(en.draft).toBe("Draft — for legal review");
    expect(pl.asOf("2026-11-10")).toContain("2026-11-10");
    expect(en.asOf("2026-11-10")).toContain("2026-11-10");
  });

  it("leaves the operator's identity and contact as placeholders", () => {
    const plText = documentText(pl);
    const enText = documentText(en);
    for (const field of ["[nazwa operatora]", "[adres siedziby]", "[NIP]", "[e-mail kontaktowy]"]) {
      expect(plText).toContain(field);
    }
    for (const field of ["[operator name]", "[registered address]", "[tax ID (NIP)]", "[contact e-mail]"]) {
      expect(enText).toContain(field);
    }
  });

  it("contains no e-mail address and no external link, but the product's name", () => {
    for (const doc of [pl, en]) {
      const text = documentText(doc);
      expect(text).not.toMatch(EMAIL);
      expect(text).not.toMatch(URL);
      expect(text).toContain(PRODUCT_NAME);
      expect(text).not.toContain("Kolacja podwyżkowa");
    }
  });
});

describe("the drafts state what the app really does", () => {
  it("names every cookie of the app with its real lifetime", () => {
    const languageDays = String(LOCALE_COOKIE_MAX_AGE_SECONDS / 86_400);
    for (const locale of LOCALES) {
      const text = documentText(privacyPolicyMessages(locale));
      for (const cookie of [SESSION_COOKIE, WAITER_COOKIE, localeCookieName("/"), localeCookieName("/r/x")]) {
        expect(text).toContain(cookie);
      }
      expect(text).toContain(`${String(SESSION_DAYS)} `);
      expect(text).toContain(`${languageDays} `);
    }
    expect([SESSION_COOKIE, WAITER_COOKIE, localeCookieName("/"), localeCookieName("/r/x")]).toEqual([
      "kp-session",
      "kp-waiter",
      "kp-lang",
      "kp-lang-r",
    ]);
  });

  it("states the retention term, the support window and the one-time links", () => {
    for (const locale of LOCALES) {
      const policy = documentText(privacyPolicyMessages(locale));
      const terms = documentText(termsMessages(locale));
      for (const text of [policy, terms]) {
        expect(text).toContain(String(DEFAULT_GUEST_RETENTION_DAYS));
        expect(text).toContain(String(MAX_GUEST_RETENTION_DAYS));
        expect(text).toContain(`${String(SUPPORT_MINUTES)} `);
        expect(text).toContain(`${String(INVITE_TTL_DAYS)} `);
        expect(text).toContain(`${String(RESET_TTL_HOURS)} `);
      }
      expect(terms).toContain(String(MIN_GUEST_RETENTION_DAYS));
      expect(terms).toContain(String(PASSWORD_MIN_LENGTH));
    }
  });

  it("names the paid modules without any price", () => {
    for (const locale of LOCALES) {
      const terms = documentText(termsMessages(locale));
      for (const module of PAID_MODULES) {
        expect(terms).toContain(modulesMessages(locale).names[module]);
      }
      expect(terms).not.toMatch(/\d\s?(zł|PLN|EUR|USD|€|\$)/);
    }
  });

  it("keeps guest data with the restaurant as the controller and never sends it to AI", () => {
    const policy = documentText(privacyPolicyMessages("pl"));
    expect(policy).toContain("w imieniu restauracji, która jest ich administratorem");
    expect(policy).toContain("art. 9 RODO");
    expect(policy).toContain("nigdy gości");
  });
});

describe("the product page", () => {
  it("has the same shape in both languages and no e-mail address or external link", () => {
    const pl = landingMessages("pl");
    const en = landingMessages("en");
    expect(en.audience).toHaveLength(pl.audience.length);
    expect(en.features).toHaveLength(pl.features.length);
    expect(en.steps).toHaveLength(pl.steps.length);
    expect(pl.steps).toHaveLength(7);
    expect(en.privacy).toHaveLength(pl.privacy.length);
    for (const locale of LOCALES) {
      const text = landingText(locale);
      expect(text).not.toMatch(EMAIL);
      expect(text).not.toMatch(URL);
      expect(text).toContain(PRODUCT_NAME);
      expect(text).toContain(String(DEFAULT_GUEST_RETENTION_DAYS));
      expect(text).not.toContain("Kolacja podwyżkowa");
    }
  });

  it("links both drafts under Polish slugs, sent never cached and never indexed", () => {
    expect([TERMS_PATH, PRIVACY_POLICY_PATH]).toEqual(["/regulamin", "/polityka-prywatnosci"]);
    expect(LEGAL_DRAFT_HEADERS).toEqual({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
    expect(legalLinksMessages("pl").draft).toBe("wersja robocza");
    expect(legalLinksMessages("en").draft).toBe("draft");
  });
});

describe("the product's working name lives in one constant", () => {
  const files = [
    ...readdirSync("src/lib/legal")
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .map((name) => join("src/lib/legal", name)),
    ...readdirSync("src/components/legal").map((name) => join("src/components/legal", name)),
    "src/pages/index.astro",
    "src/pages/regulamin.astro",
    "src/pages/polityka-prywatnosci.astro",
  ];

  it("finds the sources", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it.each(files)("%s never spells the product's name", (file) => {
    const text = readFileSync(file, "utf8");
    expect(text).not.toContain(PRODUCT_NAME);
    expect(text).not.toContain("Kolacja podwyżkowa");
  });
});
