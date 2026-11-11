import { describe, expect, it } from "vitest";
import { topicSystemPrompt } from "@/lib/ai-topics/prompt";
import { PRODUCT_NAME } from "@/lib/i18n/product";
import { sniffImageType } from "@/lib/venue/image";
import {
  BRAND_EDIT_ROLES,
  BRAND_VIEW_ROLES,
  brandStyle,
  brandTextColor,
  isLogoKind,
  logoUrl,
  MAX_LOGO_BYTES,
  parseBrandColor,
  parseBrandName,
  restaurantLogoUrl,
} from "./rules";
import { brandingMessages } from "./messages";

describe("parseBrandColor", () => {
  it("accepts #rrggbb and #rgb in any case and lowercases them", () => {
    expect(parseBrandColor("#1E3A8A")).toEqual({ ok: true, color: "#1e3a8a" });
    expect(parseBrandColor("  #abc ")).toEqual({ ok: true, color: "#aabbcc" });
  });

  it("treats empty and null as no colour", () => {
    expect(parseBrandColor("")).toEqual({ ok: true, color: null });
    expect(parseBrandColor(null)).toEqual({ ok: true, color: null });
  });

  it("refuses names, functions, wrong lengths and anything that could escape a style attribute", () => {
    for (const bad of ["red", "#12345", "#1234567", "rgb(0,0,0)", "url(x)", "#1e3a8a;color:red", "1e3a8a", "#ggg"]) {
      expect(parseBrandColor(bad)).toEqual({ ok: false });
    }
  });
});

describe("brandTextColor", () => {
  it("picks white on dark colours and black on light ones (the higher WCAG contrast)", () => {
    expect(brandTextColor("#000000")).toBe("#ffffff");
    expect(brandTextColor("#1e3a8a")).toBe("#ffffff");
    expect(brandTextColor("#7c2d12")).toBe("#ffffff");
    expect(brandTextColor("#ffffff")).toBe("#000000");
    expect(brandTextColor("#facc15")).toBe("#000000");
    expect(brandTextColor("#22c55e")).toBe("#000000");
  });
});

describe("parseBrandName", () => {
  it("normalizes like names, empty → none, at most 80 code points", () => {
    expect(parseBrandName("  Acme   sp. z o.o. ")).toEqual({ ok: true, name: "Acme sp. z o.o." });
    expect(parseBrandName("   ")).toEqual({ ok: true, name: null });
    expect(parseBrandName(null)).toEqual({ ok: true, name: null });
    expect(parseBrandName("ż".repeat(80))).toEqual({ ok: true, name: "ż".repeat(80) });
    expect(parseBrandName("a".repeat(81))).toEqual({ ok: false });
  });
});

describe("logo rules", () => {
  it("caps a logo at 512 KiB and builds versioned URLs", () => {
    expect(MAX_LOGO_BYTES).toBe(524288);
    expect(logoUrl("/api/g/KEY/branding", "restaurant", 17)).toBe("/api/g/KEY/branding/logo?kind=restaurant&v=17");
    expect(restaurantLogoUrl("/api/panel/restaurants/3/branding", 5)).toBe(
      "/api/panel/restaurants/3/branding/logo?v=5",
    );
    expect(isLogoKind("event")).toBe(true);
    expect(isLogoKind("restaurant")).toBe(true);
    expect(isLogoKind("other")).toBe(false);
    expect(isLogoKind(null)).toBe(false);
  });

  it("never takes SVG or HTML as a logo (the venue plan's magic-byte sniff)", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    expect(sniffImageType(svg)).toBeNull();
    expect(sniffImageType(html)).toBeNull();
  });

  it("lets only owners edit and owners and managers see the restaurant's brand", () => {
    expect([...BRAND_EDIT_ROLES]).toEqual(["owner"]);
    expect([...BRAND_VIEW_ROLES]).toEqual(["owner", "manager"]);
  });

  it("styles a brand header only when a colour is set", () => {
    expect(brandStyle("#1e3a8a", "#ffffff")).toBe("background-color: #1e3a8a; color: #ffffff;");
    expect(brandStyle(null, null)).toBeUndefined();
  });
});

describe("white-label texts", () => {
  it("the AI prompt and the branding texts never name the raise dinner or the platform", () => {
    for (const locale of ["pl", "en"] as const) {
      const prompt = topicSystemPrompt(locale);
      expect(prompt).not.toMatch(/podwyżkow|raise dinner/i);
      expect(JSON.stringify(brandingMessages(locale))).not.toContain(PRODUCT_NAME);
    }
  });
});
