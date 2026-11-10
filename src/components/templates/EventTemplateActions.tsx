import { useId, useState, type SubmitEvent } from "react";
import { networkFailure, readJson, toFailure } from "@/components/hooks/api-failure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EVENT_NAME_MAX } from "@/lib/events/rules";
import type { Locale } from "@/lib/i18n";
import { templateMessages, templateNameProblemText } from "@/lib/templates/messages";
import { parseTemplateName, templatePath } from "@/lib/templates/rules";
import type {
  TemplateListAnswerDto,
  TemplateUpdateAnswerDto,
  TemplateUpdatePreviewDto,
  VenueTemplateSummaryDto,
} from "@/types";

interface Props {
  eventId: number;
  eventName: string;
  restaurantId: number;
  templates: VenueTemplateSummaryDto[];
  locale: Locale;
}

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-10 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]";

type Message = { text: string; error: boolean; link?: string } | null;

// The event card's „Szablon sali” section (venue-templates, S-15; FR-030, US-06, US-09): „Zapisz salę jako szablon”
// copies this event's room into a new template of the restaurant; „Zaktualizuj z szablonu” first reads what would
// change and who loses a seat (GET …/from-template/<templateId>), shows it, and only after a confirm naming those
// guests replaces the room (POST). One action at a time; the TV changes after the next „Opublikuj”.
export function EventTemplateActions({ eventId, eventName, restaurantId, templates: initial, locale }: Props) {
  const t = templateMessages(locale);
  const id = useId();
  const [templates, setTemplates] = useState(initial);
  const [name, setName] = useState(t.defaultName(eventName).slice(0, EVENT_NAME_MAX));
  const [chosen, setChosen] = useState<number | null>(initial[0]?.id ?? null);
  const [preview, setPreview] = useState<TemplateUpdatePreviewDto | null>(null);
  const [pending, setPending] = useState<"save" | "check" | "apply" | null>(null);
  const [saveMessage, setSaveMessage] = useState<Message>(null);
  const [updateMessage, setUpdateMessage] = useState<Message>(null);
  const updateUrl = (templateId: number) => `/api/panel/events/${String(eventId)}/from-template/${String(templateId)}`;

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseTemplateName(name);
    if (!parsed.ok) {
      setSaveMessage({ text: templateNameProblemText(parsed.reason, locale), error: true });
      return;
    }
    setPending("save");
    try {
      const response = await fetch(`/api/panel/restaurants/${String(restaurantId)}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parsed.name, sourceEventId: eventId }),
      });
      const data = await readJson(response);
      const answer = data as Partial<TemplateListAnswerDto> | null;
      if (response.status === 201 && answer?.template && Array.isArray(answer.templates)) {
        setTemplates(answer.templates);
        setChosen((current) => current ?? answer.template?.id ?? null);
        setSaveMessage({ text: t.savedAs(answer.template.name), error: false, link: templatePath(answer.template.id) });
      } else {
        setSaveMessage({ text: toFailure(data, locale).message, error: true });
      }
    } catch {
      setSaveMessage({ text: networkFailure(locale).message, error: true });
    }
    setPending(null);
  }

  async function readPreview(templateId: number): Promise<TemplateUpdatePreviewDto | null> {
    const response = await fetch(updateUrl(templateId));
    const data = await readJson(response);
    const fresh = (data as Partial<TemplateUpdateAnswerDto> | null)?.preview;
    if (response.ok && fresh) {
      return fresh;
    }
    setUpdateMessage({ text: response.status === 404 ? t.templateGone : toFailure(data, locale).message, error: true });
    return null;
  }

  async function check() {
    if (chosen === null) {
      return;
    }
    setPending("check");
    setUpdateMessage(null);
    try {
      setPreview(await readPreview(chosen));
    } catch {
      setUpdateMessage({ text: networkFailure(locale).message, error: true });
    }
    setPending(null);
  }

  async function apply() {
    if (chosen === null) {
      return;
    }
    setPending("apply");
    setUpdateMessage(null);
    try {
      // Always the fresh preview: the confirm names exactly who loses a seat now.
      const fresh = await readPreview(chosen);
      setPreview(fresh);
      if (!fresh) {
        setPending(null);
        return;
      }
      const lost = fresh.lost.map((seat) => seat.guestName);
      if (!window.confirm(t.confirmApply(fresh.templateName, lost))) {
        setPending(null);
        return;
      }
      const response = await fetch(updateUrl(chosen), { method: "POST" });
      const data = await readJson(response);
      const answer = data as Partial<TemplateUpdateAnswerDto> | null;
      if (response.ok && answer?.result && answer.preview) {
        setPreview(answer.preview);
        setUpdateMessage({ text: t.applied(answer.result), error: false });
      } else {
        setUpdateMessage({
          text: response.status === 404 ? t.templateGone : toFailure(data, locale).message,
          error: true,
        });
      }
    } catch {
      setUpdateMessage({ text: networkFailure(locale).message, error: true });
    }
    setPending(null);
  }

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-5 rounded-xl border p-4 sm:p-6"
      data-event-templates
    >
      <h2 id={`${id}-heading`} className="text-xl font-semibold">
        {t.sectionHeading}
      </h2>

      <form className="flex flex-col gap-3" onSubmit={(event) => void save(event)} noValidate>
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold">{t.saveHeading}</h3>
          <p className="text-muted-foreground text-sm">{t.saveIntro}</p>
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
              value={name}
              maxLength={EVENT_NAME_MAX}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>
          <Button type="submit" className="h-10" disabled={pending !== null}>
            {pending === "save" ? t.saving : t.saveButton}
          </Button>
        </div>
        {saveMessage && (
          <p
            role={saveMessage.error ? "alert" : "status"}
            className={saveMessage.error ? "text-destructive text-sm" : "text-sm"}
          >
            {saveMessage.text}{" "}
            {saveMessage.link && (
              <a href={saveMessage.link} className="underline underline-offset-4">
                {t.openTemplate}
              </a>
            )}
          </p>
        )}
      </form>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold">{t.updateHeading}</h3>
          <p className="text-muted-foreground text-sm">{t.updateIntro}</p>
        </div>
        {templates.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t.noTemplates}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor={`${id}-template`} className="text-sm font-medium">
                {t.chooseLabel}
              </label>
              <select
                id={`${id}-template`}
                value={chosen ?? ""}
                onChange={(event) => {
                  setChosen(Number(event.target.value));
                  setPreview(null);
                  setUpdateMessage(null);
                }}
                className={SELECT_CLASS}
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={pending !== null}
              onClick={() => void check()}
            >
              {pending === "check" ? t.checking : t.checkButton}
            </Button>
            <Button type="button" className="h-10" disabled={pending !== null} onClick={() => void apply()}>
              {pending === "apply" ? t.applying : t.applyButton}
            </Button>
          </div>
        )}
        {preview && (
          <div className="flex flex-col gap-1 rounded-md border p-3 text-sm" data-template-preview>
            {preview.lost.length === 0 ? (
              <p>{t.lostNone}</p>
            ) : (
              <>
                <p className="font-medium">{t.lostHeading(preview.lost.length)}</p>
                <ul className="list-disc pl-5" data-template-lost>
                  {preview.lost.map((seat) => (
                    <li key={`${seat.table}-${String(seat.seat)}`}>
                      {t.lostLine(seat.guestName, seat.table, seat.seat)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {preview.tablesRemoved.length > 0 && <p>{t.tablesRemoved(preview.tablesRemoved)}</p>}
            {preview.tablesResized.length > 0 && <p>{t.tablesResized(preview.tablesResized)}</p>}
            {preview.tablesAdded.length > 0 && <p>{t.tablesAdded(preview.tablesAdded)}</p>}
            {preview.roomsRemoved.length > 0 && <p>{t.roomsRemoved(preview.roomsRemoved)}</p>}
            {preview.roomsAdded.length > 0 && <p>{t.roomsAdded(preview.roomsAdded)}</p>}
            {preview.planChange === "replaced" && <p className="text-muted-foreground">{t.planReplaced}</p>}
            {preview.planChange === "removed" && <p className="text-muted-foreground">{t.planRemoved}</p>}
          </div>
        )}
        {updateMessage && (
          <p
            role={updateMessage.error ? "alert" : "status"}
            className={updateMessage.error ? "text-destructive text-sm" : "text-sm"}
          >
            {updateMessage.text}
          </p>
        )}
      </div>
    </section>
  );
}
