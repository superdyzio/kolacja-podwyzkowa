import { Button } from "@/components/ui/button";
import { MAX_GROUP_SIZE, MIN_GROUP_SIZE } from "@/lib/guests/names";
import type { GuestGroupDto } from "@/types";

interface Props {
  groups: GuestGroupDto[];
  nameById: ReadonlyMap<number, string>;
  pending: boolean;
  onDissolve: (groupId: number) => void;
}

// Inseparable groups (FR-002): who sits together, and a way to dissolve a group.
export function GuestGroups({ groups, nameById, pending, onDissolve }: Props) {
  return (
    <section aria-labelledby="groups-heading" className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 id="groups-heading" className="text-lg font-semibold">
        Nierozdzielne grupy
      </h2>
      {groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Brak grup. Zaznacz na liście od {MIN_GROUP_SIZE} do {MAX_GROUP_SIZE} osób i utwórz parę albo grupę — będą
          zawsze siedzieć razem.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((group) => {
            const names = group.memberIds.map((id) => nameById.get(id) ?? "?");
            return (
              <li key={group.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 pl-3">
                <span className="min-w-0">
                  <span className="text-muted-foreground block text-xs">
                    {names.length === 2 ? "Para" : `Grupa (${names.length})`}
                  </span>
                  <span className="font-medium break-words">{names.join(" + ")}</span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0"
                  disabled={pending}
                  onClick={() => {
                    onDissolve(group.id);
                  }}
                  aria-label={`Rozwiąż: ${names.join(", ")}`}
                >
                  Rozwiąż
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
