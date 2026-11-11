import { useId, useState, type SubmitEvent } from "react";
import { networkFailure, readJson, toFailure } from "@/components/hooks/api-failure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EVENT_NAME_MAX } from "@/lib/events/rules";
import type { Locale } from "@/lib/i18n";
import { templateMessages, templateNameProblemText } from "@/lib/templates/messages";
import { parseTemplateName, templatePath } from "@/lib/templates/rules";
import type { TemplateListAnswerDto } from "@/types";

interface Props {
  restaurantId: number;
  locale: Locale;
}

// „Nowy szablon sali” (venue-templates, S-15): a name → an empty template → its page, where the venue editor uploads
// the plan and draws rooms and tables. Checked here with the server's own name rule first.
export function NewTemplateForm({ restaurantId, locale }: Props) {
  const t = templateMessages(locale);
  const id = useId();
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseTemplateName(name);
    if (!parsed.ok) {
      setProblem(templateNameProblemText(parsed.reason, locale));
      return;
    }
    setProblem(null);
    setPending(true);
    try {
      const response = await fetch(`/api/panel/restaurants/${String(restaurantId)}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parsed.name }),
      });
      const data = await readJson(response);
      const created = (data as Partial<TemplateListAnswerDto> | null)?.template;
      if (response.status === 201 && created && typeof created.id === "number") {
        window.location.assign(templatePath(created.id));
        return;
      }
      setProblem(toFailure(data, locale).message);
    } catch {
      setProblem(networkFailure(locale).message);
    }
    setPending(false);
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)} noValidate>
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">{t.newHeading}</h3>
        <p className="text-muted-foreground text-sm">{t.newIntro}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 grow flex-col gap-2">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">
            {t.nameLabel}
          </label>
          <Input
            id={`${id}-name`}
            type="text"
            autoComplete="off"
            placeholder={t.namePlaceholder}
            value={name}
            maxLength={EVENT_NAME_MAX}
            required
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? t.creating : t.createButton}
        </Button>
      </div>
      {problem && (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
    </form>
  );
}
