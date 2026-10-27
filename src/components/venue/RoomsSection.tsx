import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pluralPl } from "@/lib/guests/summary";
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
}

function deleteRoomQuestion(room: RoomDto, tableCount: number): string {
  if (tableCount === 0) {
    return `Usunąć salę „${room.name}”?`;
  }
  return `Usunąć salę „${room.name}” i jej ${tableCount} ${pluralPl(tableCount, "stolik", "stoliki", "stolików")}?`;
}

function RoomRow({
  room,
  tableCount,
  pending,
  onRename,
  onDelete,
}: {
  room: RoomDto;
  tableCount: number;
  pending: boolean;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
}) {
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
            Nowa nazwa sali: {room.name}
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
            Zapisz
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            onClick={() => {
              setEditing(false);
            }}
          >
            Anuluj
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
          {tableCount} {pluralPl(tableCount, "stolik", "stoliki", "stolików")}
        </span>
      </div>
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
        Zmień nazwę
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="text-destructive hover:text-destructive h-10"
        disabled={pending}
        onClick={onDelete}
      >
        Usuń
      </Button>
    </li>
  );
}

// Named rooms of the venue (FR-005): add, rename, delete (with its tables, after a confirm naming their count and
// the guests who lose their seats).
export function RoomsSection({ rooms, tableCountByRoom, pending, onAdd, onRename, seatLoss, onDelete }: Props) {
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
        Sale
      </h2>
      {rooms.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nie ma jeszcze sal. Dodaj sale, w których stoją stoliki.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rooms.map((room) => (
            <RoomRow
              key={room.id}
              room={room}
              tableCount={tableCountByRoom.get(room.id) ?? 0}
              pending={pending}
              onRename={(newName) => onRename(room.id, newName)}
              onDelete={() => {
                if (window.confirm(deleteRoomQuestion(room, tableCountByRoom.get(room.id) ?? 0) + seatLoss(room.id))) {
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
            Nazwa sali
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
              placeholder="np. Sala kominkowa"
              className="h-10"
            />
            <Button type="submit" disabled={pending || name.trim() === ""} className="h-10 shrink-0">
              Dodaj salę
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
