// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      // Service-role key: bypasses RLS, so it must never reach the browser. All DB access goes through the server.
      SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // AI conversation topics (S-08). `mock` (default) answers from a built-in catalog without network or cost;
      // `anthropic` calls Claude and needs ANTHROPIC_API_KEY. A plain string, parsed in src/lib/ai-topics/config.ts,
      // so an unknown value shows as a hint for the organizer instead of breaking pages.
      AI_PROVIDER: envField.string({ context: "server", access: "secret", optional: true }),
      // Anthropic API key: a secret that must never reach the browser (only src/lib/ai.ts reads it).
      ANTHROPIC_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // Claude model id; default claude-haiku-5-5.
      AI_MODEL: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
