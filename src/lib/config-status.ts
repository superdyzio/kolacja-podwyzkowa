import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "astro:env/server";
import type { Locale } from "@/lib/i18n";

export interface ConfigStatus {
  name: string;
  configured: boolean;
  message: Record<Locale, string>;
}

export const configStatuses: ConfigStatus[] = [
  {
    name: "Supabase",
    configured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
    message: {
      pl: "Baza danych nie jest skonfigurowana — ustaw SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY (lokalnie: npm run env:local).",
      en: "The database is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (locally: npm run env:local).",
    },
  },
];

export const missingConfigs = configStatuses.filter((s) => !s.configured);
