// @ts-check
import { defineConfig, envField, passthroughImageService } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";

// Production builds bundle every server dependency into dist/server, so the AWS Lambda package carries no
// node_modules (scripts/package-lambda.mjs fails when anything is left unbundled). Dev keeps Vite's defaults.
function bundleServerDependencies() {
  /** @type {import("astro").AstroIntegration} */
  const integration = {
    name: "bundle-server-dependencies",
    hooks: {
      "astro:config:setup": ({ command, updateConfig }) => {
        if (command === "build") {
          updateConfig({ vite: { ssr: { noExternal: true } } });
        }
      },
    },
  };
  return integration;
}

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap(), bundleServerDependencies()],
  vite: {
    plugins: [tailwindcss()],
  },
  // Node standalone server: `npm run preview` locally, AWS Lambda (Lambda Web Adapter in front) in production.
  adapter: node({ mode: "standalone" }),
  // The app keeps no sessions; the adapter's default filesystem session store would point at a build-time path.
  session: false,
  // No image optimisation (the venue plan is served as uploaded), so no native `sharp` in the server bundle.
  image: { service: passthroughImageService() },
  security: {
    // Trust X-Forwarded-Proto: https (and X-Forwarded-Host) from the proxy in front of the server. On AWS Lambda the
    // Function URL terminates TLS and the Lambda Web Adapter forwards to http://127.0.0.1:8080 with the original Host
    // and X-Forwarded-Proto: https, so Astro.url (guest links, QR cards) and Astro's origin check (CSRF guard for
    // body-less POST/DELETE) see the public https URL. Locally nothing sends these headers and Astro.url stays as
    // requested (http://localhost:4321, http://<LAN IP>:4321). The Host header itself is used as sent either way.
    allowedDomains: [{ protocol: "https" }],
  },
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
