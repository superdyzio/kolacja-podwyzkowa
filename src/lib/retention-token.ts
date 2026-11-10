import { RETENTION_TOKEN } from "astro:env/server";
import { usableRetentionToken } from "@/lib/privacy/job";

// The only reader of RETENTION_TOKEN (retention-schedule): the daily clean-up's secret, or null when it is not set or
// too weak to open a public route (src/pages/api/jobs/retention.ts then answers 404 to everyone).
export function getRetentionToken(): string | null {
  return usableRetentionToken(RETENTION_TOKEN);
}
