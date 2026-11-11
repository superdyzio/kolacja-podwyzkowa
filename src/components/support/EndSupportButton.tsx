import { useState } from "react";
import { PLATFORM_API } from "@/components/hooks/usePlatformRestaurants";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { supportMessages } from "@/lib/support/messages";

interface Props {
  restaurantId: number;
  restaurantName: string;
  locale: Locale;
}

// „Zakończ wsparcie” in the support banner (admin-support-log, S-13): ends this login's support mode in the restaurant
// (the exit is logged for the owner) and goes back to the platform page. When there is nothing left to end (support
// already over: 404, the session is gone: 401) it goes back too; any other failure stays here with a message.
export function EndSupportButton({ restaurantId, restaurantName, locale }: Props) {
  const t = supportMessages(locale);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function end() {
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch(`${PLATFORM_API}/${String(restaurantId)}/support`, { method: "DELETE" });
      if (response.ok || response.status === 401 || response.status === 404) {
        window.location.assign("/panel/platforma");
        return;
      }
    } catch {
      // Shown below.
    }
    setFailed(true);
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="h-10 self-start"
        disabled={pending}
        aria-label={t.endLabel(restaurantName)}
        onClick={() => void end()}
        data-support-end
      >
        {pending ? t.ending : t.end}
      </Button>
      {failed && (
        <p role="alert" className="text-destructive text-sm">
          {t.endFailed}
        </p>
      )}
    </div>
  );
}
