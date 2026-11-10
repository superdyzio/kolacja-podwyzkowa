import { useState } from "react";
import { useQuestionList, parseQuestionList } from "@/components/hooks/useQuestionList";
import { useTvSpotlight } from "@/components/hooks/useTvSpotlight";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { ORGANIZER_DRAW_STORAGE_KEY } from "@/lib/questions/draw-memory";
import { questionUiMessages } from "@/lib/questions/messages";
import { countQuestions } from "@/lib/questions/summary";
import type {
  AiTopicUsageDto,
  QuestionDto,
  QuestionListDto,
  QuestionPasteResultDto,
  QuestionSkipDto,
  QuestionSkipReason,
  TvSpotlightDto,
} from "@/types";
import { CategoryChips } from "./CategoryChips";
import { OrganizerAiTopics } from "./OrganizerAiTopics";
import { QuestionAddForm } from "./QuestionAddForm";
import { QuestionDrawPanel } from "./QuestionDrawPanel";
import { QuestionRow } from "./QuestionRow";
import { ShowOnTvButton } from "./ShowOnTvButton";
import { StarterCard } from "./StarterCard";
import { TvSpotlightPanel } from "./TvSpotlightPanel";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  initial: QuestionListDto;
  // The evening's AI topic usage, counts only (S-08; client-restaurant-split: no spend, no provider).
  aiInitial: AiTopicUsageDto;
  // What is on the TV over the seating (tv-spotlight).
  tvInitial: TvSpotlightDto | null;
  // event-modules (S-17): the page's sections by module (all on when omitted).
  modules?: QuestionPageModules;
  locale: Locale;
}

export interface QuestionPageModules {
  questions: boolean;
  aiTopics: boolean;
  tvSpotlight: boolean;
}

const ALL_ON: QuestionPageModules = { questions: true, aiTopics: true, tvSpotlight: true };

const SKIP_REASONS: readonly QuestionSkipReason[] = ["duplicate", "repeated", "too-short", "too-long"];
const CONFIRM_PREVIEW_LENGTH = 60;

function isSkip(value: unknown): value is QuestionSkipDto {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { line, text, reason } = value as Record<string, unknown>;
  return typeof line === "number" && typeof text === "string" && SKIP_REASONS.some((known) => known === reason);
}

function parsePasteResult(data: unknown): QuestionPasteResultDto | null {
  const list = parseQuestionList(data);
  if (!list || typeof data !== "object" || data === null) {
    return null;
  }
  const { added, skipped } = data as Record<string, unknown>;
  if (typeof added !== "number" || !Array.isArray(skipped) || !skipped.every(isSkip)) {
    return null;
  }
  return { ...list, added, skipped };
}

function deleteQuestionPrompt(question: QuestionDto, locale: Locale): string {
  const characters = Array.from(question.text);
  const preview =
    characters.length > CONFIRM_PREVIEW_LENGTH
      ? `${characters.slice(0, CONFIRM_PREVIEW_LENGTH).join("")}…`
      : question.text;
  return questionUiMessages(locale).deleteConfirm(preview);
}

// The organizer's questions page island (S-07, US-03, FR-014, FR-015), phone-first, top to bottom: the TV controls
// (tv-spotlight, #ekran-tv), the organizer's own draw, the AI topic panel (S-08, #tematy-ai) — both with „Pokaż na TV”
// —, adding/pasting, the starter base, and the list with a category filter, in-place edit and delete. Guests never see
// this list: they only get the question they draw themselves.
export function QuestionManager({ apiBase, initial, aiInitial, tvInitial, modules = ALL_ON, locale }: Props) {
  const t = questionUiMessages(locale);
  const { list, pending, failure, send, dismissFailure } = useQuestionList(apiBase, initial, locale);
  const tv = useTvSpotlight(apiBase, tvInitial, locale);
  const [filter, setFilter] = useState<QuestionDto["category"] | null>(null);

  const counts = countQuestions(list.questions);
  const shown = filter ? list.questions.filter((question) => question.category === filter) : list.questions;

  return (
    <div className="flex flex-col gap-6">
      {modules.tvSpotlight && (
        <section
          id="ekran-tv"
          aria-labelledby="tv-heading"
          className="flex scroll-mt-4 flex-col gap-3 rounded-xl border p-4"
        >
          <h2 id="tv-heading" className="text-lg font-semibold">
            {t.tvHeading}
          </h2>
          <TvSpotlightPanel tv={tv} locale={locale} />
        </section>
      )}

      {modules.questions && (
        <section aria-labelledby="draw-heading" className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 id="draw-heading" className="text-lg font-semibold">
            {t.drawHeading}
          </h2>
          <QuestionDrawPanel
            drawUrl={`${apiBase}/questions/draw`}
            storageKey={ORGANIZER_DRAW_STORAGE_KEY}
            renderAction={
              modules.tvSpotlight
                ? (text) => <ShowOnTvButton tv={tv} kind="question" text={text} locale={locale} />
                : undefined
            }
            locale={locale}
          />
        </section>
      )}

      {modules.aiTopics && (
        <section
          id="tematy-ai"
          aria-labelledby="ai-heading"
          className="flex scroll-mt-4 flex-col gap-3 rounded-xl border p-4"
        >
          <h2 id="ai-heading" className="text-lg font-semibold">
            {t.aiHeading}
          </h2>
          <OrganizerAiTopics
            apiBase={apiBase}
            initial={aiInitial}
            renderAction={
              modules.tvSpotlight
                ? (text) => <ShowOnTvButton tv={tv} kind="topic" text={text} locale={locale} />
                : undefined
            }
            locale={locale}
          />
        </section>
      )}

      {modules.questions && (
        <>
          {failure && (
            // Sticky: an edit far down the list must still show why it was refused.
            <div role="alert" className="bg-background sticky top-2 z-10 rounded-lg shadow-md">
              <div className="border-destructive/50 bg-destructive/5 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <p className="text-destructive font-medium">{failure.message}</p>
                <Button type="button" variant="ghost" className="h-10" onClick={dismissFailure}>
                  {t.close}
                </Button>
              </div>
            </div>
          )}

          <QuestionAddForm
            pending={pending}
            onAdd={async (category, text) =>
              parsePasteResult(await send({ method: "POST", path: "/questions", body: { category, text } }))
            }
            locale={locale}
          />

          <StarterCard
            starterMissing={list.starterMissing}
            pending={pending}
            onLoad={async () => {
              const data = await send({ method: "POST", path: "/questions/starter" });
              const added = typeof data === "object" && data !== null ? (data as { added?: unknown }).added : undefined;
              return typeof added === "number" ? added : null;
            }}
            locale={locale}
          />

          <section aria-labelledby="questions-heading" className="flex flex-col gap-3">
            <h2 id="questions-heading" className="text-lg font-semibold">
              {t.listHeading(counts.all)}
            </h2>
            {counts.all === 0 ? (
              <p className="text-muted-foreground text-sm">{t.baseEmpty}</p>
            ) : (
              <>
                <CategoryChips
                  label={t.filterLabel}
                  value={filter}
                  onChange={setFilter}
                  counts={counts}
                  locale={locale}
                />
                {shown.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t.categoryEmpty}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {shown.map((question) => (
                      <QuestionRow
                        key={question.id}
                        question={question}
                        pending={pending}
                        onSave={async (change) =>
                          (await send({ method: "PATCH", path: `/questions/${question.id}`, body: change })) !== null
                        }
                        onDelete={() => {
                          if (window.confirm(deleteQuestionPrompt(question, locale))) {
                            void send({ method: "DELETE", path: `/questions/${question.id}` });
                          }
                        }}
                        locale={locale}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
