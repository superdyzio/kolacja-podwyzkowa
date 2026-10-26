import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Plain Vitest config (not Astro's getViteConfig): tests import only pure helpers that never touch `astro:*` modules.
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Loads .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) so integration tests can reach the local DB.
    env: loadEnv(mode, process.cwd(), ""),
    // Integration tests share the singleton event row; run files one after another.
    fileParallelism: false,
  },
}));
