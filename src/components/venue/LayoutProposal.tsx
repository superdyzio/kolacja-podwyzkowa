import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PITCH_KEY,
  applyBody,
  describeCost,
  describePitch,
  describeRoomOutline,
  describeSeats,
  describeUpdate,
  editNewTable,
  isEmptyBody,
  isValidEdit,
  newTableKey,
  newTableValues,
  pitchChanged,
  roomKey,
  toggleLine,
  updateKey,
  type ApplyLayoutBody,
  type ProposalSelection,
} from "@/lib/venue-ai/draft";
import { MAX_SEATS, MAX_TABLE_NAME_LENGTH, MIN_SEATS } from "@/lib/venue/rules";
import type { RoomDto, VenueLayoutProposalAnswerDto } from "@/types";

interface Props {
  answer: VenueLayoutProposalAnswerDto;
  rooms: RoomDto[];
  selection: ProposalSelection;
  onSelectionChange: (selection: ProposalSelection) => void;
  pending: boolean;
  onApply: (body: ApplyLayoutBody) => void;
  onDiscard: () => void;
}

function Line({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-2">
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="accent-primary mt-0.5 size-4 shrink-0"
        />
        <span>{children}</span>
      </label>
    </li>
  );
}

// The draft of an AI layout read (venue-drawing): one line per change, all ticked; the kept lines show dashed on the
// plan. New tables can be renamed, moved to another room and given another seat count before applying. Applying
// changes only the working venue; the TV and phones follow after „Opublikuj” on the seating page.
export function LayoutProposal({ answer, rooms, selection, onSelectionChange, pending, onApply, onDiscard }: Props) {
  const formId = useId();
  const { proposal } = answer;
  const kept = (key: string) => !selection.dropped.has(key);
  const toggle = (key: string) => {
    onSelectionChange(toggleLine(selection, key));
  };
  const body = applyBody(answer, selection);
  const editsValid = proposal.newTables.every(
    (table, index) => !kept(newTableKey(index)) || isValidEdit(newTableValues(table, index, selection)),
  );
  const nothing =
    proposal.updates.length === 0 &&
    proposal.newTables.length === 0 &&
    proposal.rooms.length === 0 &&
    !pitchChanged(answer);

  return (
    <section aria-labelledby={`${formId}-heading`} className="flex flex-col gap-3 rounded-xl border p-4">
      <h3 id={`${formId}-heading`} className="font-semibold">
        Propozycja układu z AI
      </h3>
      {nothing ? (
        <p className="text-sm">AI nie znalazło nic do zmiany.</p>
      ) : (
        <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {proposal.updates.map((update) => (
            <Line
              key={updateKey(update)}
              checked={kept(updateKey(update))}
              onToggle={() => {
                toggle(updateKey(update));
              }}
            >
              {describeUpdate(update)}
            </Line>
          ))}
          {proposal.newTables.map((table, index) => {
            const key = newTableKey(index);
            const values = newTableValues(table, index, selection);
            const room = rooms.find((candidate) => candidate.id === values.roomId);
            return (
              <li key={key} className="flex flex-col gap-2 rounded-lg border p-2">
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={kept(key)}
                    onChange={() => {
                      toggle(key);
                    }}
                    className="accent-primary mt-0.5 size-4 shrink-0"
                  />
                  <span>
                    Nowy stolik „{values.name}” ({describeSeats(values.seatCount)}, {room?.name ?? "?"})
                  </span>
                </label>
                {kept(key) && (
                  <div className="grid grid-cols-[1fr_4.5rem] gap-2 pl-6">
                    <Input
                      aria-label="Nazwa nowego stolika"
                      value={values.name}
                      maxLength={MAX_TABLE_NAME_LENGTH}
                      onChange={(event) => {
                        onSelectionChange(editNewTable(selection, index, { ...values, name: event.target.value }));
                      }}
                      className="h-9"
                    />
                    <Input
                      aria-label="Liczba miejsc nowego stolika"
                      type="number"
                      inputMode="numeric"
                      min={MIN_SEATS}
                      max={MAX_SEATS}
                      value={values.seatCount}
                      onChange={(event) => {
                        onSelectionChange(
                          editNewTable(selection, index, { ...values, seatCount: Number(event.target.value) }),
                        );
                      }}
                      className="h-9"
                    />
                    <select
                      aria-label="Sala nowego stolika"
                      value={values.roomId}
                      onChange={(event) => {
                        onSelectionChange(
                          editNewTable(selection, index, { ...values, roomId: Number(event.target.value) }),
                        );
                      }}
                      className="border-input col-span-2 h-9 rounded-md border bg-transparent px-2 text-sm"
                    >
                      {rooms.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </li>
            );
          })}
          {proposal.rooms.map((room) => (
            <Line
              key={roomKey(room.roomId)}
              checked={kept(roomKey(room.roomId))}
              onToggle={() => {
                toggle(roomKey(room.roomId));
              }}
            >
              {describeRoomOutline(room.name, room.previous)}
            </Line>
          ))}
          {pitchChanged(answer) && (
            <Line
              checked={kept(PITCH_KEY)}
              onToggle={() => {
                toggle(PITCH_KEY);
              }}
            >
              {describePitch(answer)}
            </Line>
          )}
        </ul>
      )}
      {proposal.skipped > 0 && (
        <p className="text-muted-foreground text-xs">
          Pominięto stoliki bez sali albo ponad limit: {proposal.skipped}.
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        Przerywane linie na planie pokazują zaznaczone zmiany. Przypisania gości do miejsc zostają. TV i telefony pokażą
        nowy rysunek po publikacji rozsadzenia. {describeCost(answer.costNanoUsd)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="h-10"
          disabled={pending || !editsValid || isEmptyBody(body)}
          onClick={() => {
            onApply(body);
          }}
        >
          Zastosuj zaznaczone
        </Button>
        <Button type="button" variant="ghost" className="h-10" onClick={onDiscard}>
          Odrzuć
        </Button>
      </div>
    </section>
  );
}
