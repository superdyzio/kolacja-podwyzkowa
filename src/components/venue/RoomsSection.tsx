import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/i18n";
import { venueEditorMessages } from "@/lib/venue/messages";
import { MAX_ROOM_NAME_LENGTH, MAX_ROOMS } from "@/lib/venue/rules";
import type { RoomDto } from "@/types";

interface Props {
  rooms: RoomDto[];
  tableCountByRoom: Map<number, number>;
  pending: boolean;
  onAdd: (name: string) => Promise<boolean>;
  onRename: (roomId: number, name: string) => Promise<boolean>;
  // „\n\nMiejsce stracą: …” for the guests seated at the room's tables, or "".
  seatLoss: (roomId: number) => string;
  onDelete: (roomId: number) => void;
  // Opens the outline of the room on the plan („Kontur”); absent while there is no plan to draw on.
  onOutline?: (roomId: number) => void;
  locale: Locale;
}

function deleteRoomQuestion(room: RoomDto, tableCount: number, locale: Locale): string {
  const t = venueEditorMessages(locale);
  return tableCount === 0 ? t.deleteRoomQuestion(room.name) : t.deleteRoomWithTablesQuestion(room.name, tableCount);
}

function RoomRow({
  room,
  tableCount,
  pending,
  onRename,
  onDelete,
  onOutline,
  locale,
}: {
  room: RoomDto;
  tableCount: number;
  pending: boolean;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
  onOutline?: () => void;
  locale: Locale;
}) {
  const t = venueEditorMessages(locale);
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(room.name);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onRename(draft)) {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-lg border p-2">
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <label htmlFor={inputId} className="sr-only">
            {t.newRoomName(room.name)}
          </label>
          <Input
            id={inputId}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            maxLength={MAX_ROOM_NAME_LENGTH}
            autoComplete="off"
            className="h-10 min-w-0 flex-1 basis-40"
          />
          <Button type="submit" disabled={pending || draft.trim() === ""} className="h-10">
            {t.save}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            onClick={() => {
              setEditing(false);
            }}
          >
            {t.cancel}
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
      <div className="flex min-w-0 flex-1 flex-col pl-1">
        <span className="truncate font-medium">{room.name}</span>
        <span className="text-muted-foreground text-xs">
          {t.tableCount(tableCount)}
          {room.outline ? t.hasOutline : ""}
        </span>
      </div>
      {onOutline && (
        <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={onOutline}>
          {t.outlineButton}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        className="h-10"
        disabled={pending}
        onClick={() => {
          setDraft(room.name);
          setEditing(true);
        }}
      >
        {t.rename}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="text-destructive hover:text-destructive h-10"
        disabled={pending}
        onClick={onDelete}
      >
        {t.delete}
      </Button>
    </li>
  );
}

// Named rooms of the venue (FR-005): add, rename, delete (with its tables, after a confirm naming their count and
// the guests who lose their seats).
export function RoomsSection({
  rooms,
  tableCountByRoom,
  pending,
  onAdd,
  onRename,
  seatLoss,
  onDelete,
  onOutline,
  locale,
}: Props) {
  const t = venueEditorMessages(locale);
  const inputId = useId();
  const [name, setName] = useState("");

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onAdd(name)) {
      setName("");
    }
  }

  return (
    <section aria-labelledby="rooms-heading" className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 id="rooms-heading" className="text-lg font-semibold">
        {t.roomsHeading}
      </h2>
      {rooms.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.noRooms}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rooms.map((room) => (
            <RoomRow
              key={room.id}
              room={room}
              tableCount={tableCountByRoom.get(room.id) ?? 0}
              pending={pending}
              onRename={(newName) => onRename(room.id, newName)}
              locale={locale}
              onOutline={
                onOutline
                  ? () => {
                      onOutline(room.id);
                    }
                  : undefined
              }
              onDelete={() => {
                if (
                  window.confirm(
                    deleteRoomQuestion(room, tableCountByRoom.get(room.id) ?? 0, locale) + seatLoss(room.id),
                  )
                ) {
                  onDelete(room.id);
                }
              }}
            />
          ))}
        </ul>
      )}
      {rooms.length < MAX_ROOMS && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-sm font-medium">
            {t.roomName}
          </label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              maxLength={MAX_ROOM_NAME_LENGTH}
              autoComplete="off"
              enterKeyHint="done"
              placeholder={t.roomNamePlaceholder}
              className="h-10"
            />
            <Button type="submit" disabled={pending || name.trim() === ""} className="h-10 shrink-0">
              {t.addRoom}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
