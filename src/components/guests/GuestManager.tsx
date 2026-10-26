import { useMemo, useState } from "react";
import { useGuestList } from "@/components/hooks/useGuestList";
import { Button } from "@/components/ui/button";
import { MAX_GROUP_SIZE, MIN_GROUP_SIZE, isValidGroupSize } from "@/lib/guests/names";
import { formatGuestSummary, summarizeGuestList } from "@/lib/guests/summary";
import type { GuestDto, GuestListDto } from "@/types";
import { GuestAddForms } from "./GuestAddForms";
import { GuestGroups } from "./GuestGroups";
import { GuestRow } from "./GuestRow";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  initialList: GuestListDto;
}

function groupButtonLabel(count: number): string {
  if (count < MIN_GROUP_SIZE) {
    return `Zaznacz co najmniej ${MIN_GROUP_SIZE} osoby`;
  }
  if (count > MAX_GROUP_SIZE) {
    return `Grupa ma najwyżej ${MAX_GROUP_SIZE} osób`;
  }
  return count === 2 ? "Utwórz parę" : `Utwórz grupę (${count})`;
}

function deleteQuestion(guest: GuestDto, partners: string[]): string {
  const question = `Usunąć „${guest.displayName}” z listy gości?`;
  if (partners.length === 1) {
    return `${question} Para z „${partners[0]}” zostanie rozwiązana.`;
  }
  return question;
}

// Organizer guest page island (FR-001..FR-003): add/paste, rename, delete, absent/present, groups of 2–5.
export function GuestManager({ apiBase, initialList }: Props) {
  const { list, pending, failure, send, dismissFailure } = useGuestList(apiBase, initialList);
  const [selection, setSelection] = useState<number[]>([]);

  const nameById = useMemo(() => new Map(list.guests.map((guest) => [guest.id, guest.displayName])), [list.guests]);
  const partnersById = useMemo(() => {
    const partners = new Map<number, string[]>();
    for (const group of list.groups) {
      for (const id of group.memberIds) {
        partners.set(
          id,
          group.memberIds.filter((other) => other !== id).map((other) => nameById.get(other) ?? "?"),
        );
      }
    }
    return partners;
  }, [list.groups, nameById]);

  // Only guests that still exist and are not in a group can stay selected.
  const selectedIds = useMemo(() => {
    const ungrouped = new Set(list.guests.filter((guest) => guest.groupId === null).map((guest) => guest.id));
    return selection.filter((id) => ungrouped.has(id));
  }, [list.guests, selection]);

  const summary = formatGuestSummary(summarizeGuestList(list));

  function toggleSelected(id: number) {
    setSelection((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));
  }

  async function createGroup() {
    if (await send({ method: "POST", path: "/groups", body: { guestIds: selectedIds } })) {
      setSelection([]);
    }
  }

  return (
    <div className={selectedIds.length > 0 ? "flex flex-col gap-6 pb-28" : "flex flex-col gap-6"}>
      <p className="text-muted-foreground" aria-live="polite">
        {summary}
      </p>

      {failure && (
        <div role="alert" className="border-destructive/50 bg-destructive/5 flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-destructive font-medium">{failure.message}</p>
          {failure.details.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {failure.details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <Button type="button" variant="ghost" className="h-10 self-start" onClick={dismissFailure}>
            Zamknij
          </Button>
        </div>
      )}

      <GuestAddForms pending={pending} onAdd={(text) => send({ method: "POST", path: "/guests", body: { text } })} />

      <GuestGroups
        groups={list.groups}
        nameById={nameById}
        pending={pending}
        onDissolve={(groupId) => void send({ method: "DELETE", path: `/groups/${groupId}` })}
      />

      <section aria-labelledby="list-heading" className="flex flex-col gap-3">
        <h2 id="list-heading" className="text-lg font-semibold">
          Lista gości
        </h2>
        {list.guests.length === 0 ? (
          <p className="text-muted-foreground text-sm">Lista jest pusta. Dodaj gości powyżej.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.guests.map((guest) => {
              const partners = partnersById.get(guest.id) ?? [];
              return (
                <GuestRow
                  key={guest.id}
                  guest={guest}
                  groupPartners={partners}
                  selected={selectedIds.includes(guest.id)}
                  pending={pending}
                  onToggleSelected={() => {
                    toggleSelected(guest.id);
                  }}
                  onRename={(displayName) =>
                    send({ method: "PATCH", path: `/guests/${guest.id}`, body: { displayName } })
                  }
                  onToggleAbsent={() =>
                    void send({ method: "PATCH", path: `/guests/${guest.id}`, body: { isAbsent: !guest.isAbsent } })
                  }
                  onDelete={() => {
                    if (window.confirm(deleteQuestion(guest, partners))) {
                      void send({ method: "DELETE", path: `/guests/${guest.id}` });
                    }
                  }}
                />
              );
            })}
          </ul>
        )}
      </section>

      {selectedIds.length > 0 && (
        <div className="bg-background/95 fixed inset-x-0 bottom-0 z-10 border-t p-3 shadow-lg backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              Zaznaczono: <strong>{selectedIds.length}</strong>
              <span className="text-muted-foreground block text-xs">
                Grupa ma od {MIN_GROUP_SIZE} do {MAX_GROUP_SIZE} osób
              </span>
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-10"
                onClick={() => {
                  setSelection([]);
                }}
              >
                Wyczyść
              </Button>
              <Button
                type="button"
                className="h-10"
                disabled={pending || !isValidGroupSize(selectedIds.length)}
                onClick={() => void createGroup()}
              >
                {groupButtonLabel(selectedIds.length)}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
