import { usePlatformRestaurants } from "@/components/hooks/usePlatformRestaurants";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { platformMessages } from "@/lib/platform/messages";
import type { PlatformRestaurantDto } from "@/types";
import { NewRestaurantForm } from "./NewRestaurantForm";
import { PlatformRestaurantCard } from "./PlatformRestaurantCard";

interface Props {
  initial: PlatformRestaurantDto[];
  // This request's origin: one-time links are built from it (https behind the Lambda proxy).
  origin: string;
  locale: Locale;
}

// The platform administrator's page island (platform-restaurants, S-10): „Nowa restauracja” and every restaurant
// with its counters, owners, links and switch. Every answer replaces the whole list.
export function PlatformRestaurantsManager({ initial, origin, locale }: Props) {
  const t = platformMessages(locale);
  const { restaurants, pending, failure, send, dismissFailure } = usePlatformRestaurants(initial, locale);

  return (
    <div className="flex flex-col gap-6">
      {failure && (
        <div
          role="alert"
          aria-label={t.errorRegion}
          className="border-destructive/50 bg-destructive/5 flex flex-col gap-2 rounded-lg border p-3"
        >
          <p className="text-destructive font-medium">{failure.message}</p>
          <Button type="button" variant="ghost" className="h-10 self-start" onClick={dismissFailure}>
            {t.dismiss}
          </Button>
        </div>
      )}

      <NewRestaurantForm pending={pending} send={send} origin={origin} locale={locale} />

      <section aria-labelledby="platform-restaurants-heading" className="flex flex-col gap-3">
        <h2 id="platform-restaurants-heading" className="text-xl font-semibold">
          {t.listHeading(restaurants.length)}
        </h2>
        {restaurants.length === 0 ? (
          <p className="text-muted-foreground">{t.emptyList}</p>
        ) : (
          <ul aria-label={t.listRegion} className="flex flex-col gap-3">
            {restaurants.map((restaurant) => (
              <PlatformRestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                pending={pending}
                send={send}
                origin={origin}
                locale={locale}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
