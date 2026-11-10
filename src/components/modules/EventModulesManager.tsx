import { Button } from "@/components/ui/button";
import { useEventModules } from "@/components/hooks/useEventModules";
import type { Locale } from "@/lib/i18n/locale";
import { modulesMessages } from "@/lib/modules/messages";
import type { EventModuleDto, EventModulesDto } from "@/types";

// The modules of one event (event-modules, S-17; FR-031, US-07). One island, three capabilities, each given by its
// URL: the client's switch (`clientApi`: PUT { module, enabled } — /api/o/<key>/modules, or the panel's dispatcher
// while „Lokal prowadzi” is on), the venue's offer (`venueApi`: PUT { module, available }) and the platform
// administrator's unlock of a paid module in support mode (`adminApi`: PUT <adminApi>/<module> { unlocked }). Without
// any URL it only shows the state. Every change that takes something away asks first.
interface Props {
  initial: EventModulesDto;
  clientApi?: string | null;
  venueApi?: string | null;
  adminApi?: string | null;
  locale: Locale;
}

function stateLabel(module: EventModuleDto, locale: Locale): string {
  const t = modulesMessages(locale);
  if (!module.available) {
    return t.stateUnavailable;
  }
  if (module.paid && !module.unlocked) {
    return t.stateLocked;
  }
  return module.enabled ? t.stateOn : t.stateOff;
}

export function EventModulesManager({ initial, clientApi = null, venueApi = null, adminApi = null, locale }: Props) {
  const t = modulesMessages(locale);
  const { state, pending, failure, send, dismissFailure } = useEventModules(initial, locale);

  return (
    <div className="flex flex-col gap-3" data-event-modules>
      {failure && (
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/5 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
        >
          <p className="text-destructive font-medium">{failure.message}</p>
          <Button type="button" variant="ghost" className="h-10" onClick={dismissFailure} aria-label={t.dismiss}>
            ✕
          </Button>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {state.modules.map((module) => {
          const name = t.names[module.key];
          const canEnable = module.available && (!module.paid || module.unlocked);
          return (
            <li
              key={module.key}
              data-module={module.key}
              data-module-active={module.active ? "true" : "false"}
              className="flex flex-col gap-2 rounded-lg border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{name}</span>
                <span
                  className={
                    module.active
                      ? "bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs"
                      : "bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs"
                  }
                >
                  {stateLabel(module, locale)}
                </span>
              </div>
              <p className="text-muted-foreground text-sm">{t.hints[module.key]}</p>
              {module.paid && module.unlocked && <p className="text-muted-foreground text-xs">{t.stateUnlocked}</p>}
              <div className="flex flex-wrap gap-2">
                {clientApi && (module.enabled || canEnable) && (
                  <Button
                    type="button"
                    variant={module.enabled ? "outline" : "default"}
                    className="h-10"
                    disabled={pending}
                    onClick={() => {
                      if (module.enabled && !window.confirm(t.confirmOff(name))) {
                        return;
                      }
                      void send(clientApi, { module: module.key, enabled: !module.enabled });
                    }}
                  >
                    {pending ? t.saving : module.enabled ? t.turnOff : t.turnOn}
                  </Button>
                )}
                {venueApi && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={pending}
                    onClick={() => {
                      if (module.available && !window.confirm(t.confirmWithdraw(name))) {
                        return;
                      }
                      void send(venueApi, { module: module.key, available: !module.available });
                    }}
                  >
                    {module.available ? t.withdraw : t.offer}
                  </Button>
                )}
                {adminApi && module.paid && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(module.unlocked ? t.confirmLock(name) : t.confirmUnlock(name))) {
                        return;
                      }
                      void send(`${adminApi}/${module.key}`, { unlocked: !module.unlocked });
                    }}
                  >
                    {module.unlocked ? t.lock : t.unlock}
                  </Button>
                )}
              </div>
              {venueApi && !clientApi && (
                <p className="text-muted-foreground text-xs">
                  {t.clientState} {module.enabled ? t.stateOn : t.stateOff} · {t.clientDecides}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
