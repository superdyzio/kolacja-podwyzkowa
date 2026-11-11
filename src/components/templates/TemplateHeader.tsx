import { useId, useState, type SubmitEvent } from "react";
import { networkFailure, readJson, toFailure } from "@/components/hooks/api-failure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EVENT_NAME_MAX } from "@/lib/events/rules";
import type { Locale } from "@/lib/i18n";
import { templateMessages, templateNameProblemText } from "@/lib/templates/messages";
import { parseTemplateName } from "@/lib/templates/rules";
import type { TemplateAnswerDto } from "@/types";

interface Props {
  templateId: number;
  restaurantId: number;
  initialName: string;
  locale: Locale;
}

// The name and the delete of a venue template (venue-templates, S-15) on its page. Deleting asks first and then goes
// back to the restaurant page; a 404 means the template is gone (another tab) — the same way back.
export function TemplateHeader({ templateId, restaurantId, initialName, locale }: Props) {
  const t = templateMessages(locale);
  const id = useId();
  const api = `/api/panel/templates/${String(templateId)}`;
  const restaurantPath = `/panel/restauracje/${String(restaurantId)}`;
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, setPending] = useState<"rename" | "delete" | null>(null);
  const [gone, setGone] = useState(false);

  async function rename(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseTemplateName(name);
    if (!parsed.ok) {
      setMessage({ text: templateNameProblemText(parsed.reason, locale), error: true });
      return;
    }
    setPending("rename");
    try {
      const response = await fetch(api, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parsed.name }),
      });
      const data = await readJson(response);
      const template = (data as Partial<TemplateAnswerDto> | null)?.template;
      if (response.ok && template) {
        setName(template.name);
        setSaved(template.name);
        setMessage({ text: t.renamed, error: false });
      } else if (response.status === 404) {
        setGone(true);
      } else {
        setMessage({ text: toFailure(data, locale).message, error: true });
      }
    } catch {
      setMessage({ text: networkFailure(locale).message, error: true });
    }
    setPending(null);
  }

  async function remove() {
    if (!window.confirm(t.confirmDelete(saved))) {
      return;
    }
    setPending("delete");
    try {
      const response = await fetch(api, { method: "DELETE" });
      if (response.ok || response.status === 404) {
        window.location.assign(restaurantPath);
        return;
      }
      setMessage({ text: toFailure(await readJson(response), locale).message, error: true });
    } catch {
      setMessage({ text: networkFailure(locale).message, error: true });
    }
    setPending(null);
  }

  if (gone) {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-2">
        {t.gone}{" "}
        <a href={restaurantPath} className="underline underline-offset-4">
          {t.backToRestaurant}
        </a>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-template-header>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void rename(event)} noValidate>
        <div className="flex min-w-0 grow flex-col gap-2">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">
            {t.nameLabel}
          </label>
          <Input
            id={`${id}-name`}
            type="text"
            autoComplete="off"
            value={name}
            maxLength={EVENT_NAME_MAX}
            required
            onChange={(event) => {
              setName(event.target.value);
              setMessage(null);
            }}
          />
        </div>
        <Button type="submit" className="h-10" disabled={pending !== null || name === saved}>
          {pending === "rename" ? t.saving : t.renameButton}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="h-10"
          disabled={pending !== null}
          onClick={() => void remove()}
        >
          {pending === "delete" ? t.deleting : t.deleteButton}
        </Button>
      </form>
      {message && (
        <p role={message.error ? "alert" : "status"} className={message.error ? "text-destructive text-sm" : "text-sm"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
