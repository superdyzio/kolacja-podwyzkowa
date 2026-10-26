import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "astro:env/server";

export interface ConfigStatus {
  name: string;
  configured: boolean;
  message: string;
}

export const configStatuses: ConfigStatus[] = [
  {
    name: "Supabase",
    configured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
    message:
      "Baza danych nie jest skonfigurowana — ustaw SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY (lokalnie: npm run env:local).",
  },
];

export const missingConfigs = configStatuses.filter((s) => !s.configured);
