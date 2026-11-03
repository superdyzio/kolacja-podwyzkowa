import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dishInstances,
  resolveSelection,
  servingSpots,
  type ServingLine,
  type ServingSelection,
  type ServingSpot,
} from "@/lib/orders/serving";
import type { OrderPlacementDto } from "@/types";

// What is picked on an order page to light up on the plan (serving-highlight): a whole dish, one piece of it, or one
// line. Lives in the page only; a refresh of the view keeps it while the dish or line still exists, Escape clears it.
// keyOf must be stable (a module-level function): it names the lines (see servingSpots). prep: the page's prep list,
// whose dish spellings the captions use.
export function useServingSelection<T extends ServingLine>(
  placement: OrderPlacementDto<T>,
  prep: readonly { name: string }[],
  keyOf?: (item: T) => string,
) {
  const [selection, setSelection] = useState<ServingSelection | null>(null);
  const spots = useMemo(() => servingSpots(placement, keyOf), [placement, keyOf]);
  const dishes = useMemo(
    () =>
      dishInstances(
        spots,
        prep.map((line) => line.name),
      ),
    [spots, prep],
  );
  const resolved = useMemo(() => resolveSelection(selection, spots, dishes), [selection, spots, dishes]);
  // The placement's own line objects are in the spots, so a list can find a line's spot by the object it renders.
  const spotByItem = useMemo(() => new Map<T, ServingSpot<T>>(spots.map((spot) => [spot.item, spot])), [spots]);
  const active = resolved !== null;

  useEffect(() => {
    if (!active) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [active]);

  // The dish again → nothing; another dish (or one of its pieces) → the whole dish.
  const toggleDish = useCallback((dish: string) => {
    setSelection((previous) =>
      previous?.kind === "dish" && previous.dish === dish && previous.instance === null
        ? null
        : { kind: "dish", dish, instance: null },
    );
  }, []);

  // The piece again → the whole dish. Held by its line, so later renumbering keeps it on the same plate.
  const toggleInstance = useCallback(
    (dish: string, number: number) => {
      const picked = dishes.get(dish)?.instances.find((one) => one.number === number);
      if (!picked) {
        return;
      }
      setSelection((previous) =>
        previous?.kind === "dish" &&
        previous.dish === dish &&
        previous.instance?.spotKey === picked.spotKey &&
        previous.instance.piece === picked.piece
          ? { kind: "dish", dish, instance: null }
          : { kind: "dish", dish, instance: { spotKey: picked.spotKey, piece: picked.piece } },
      );
    },
    [dishes],
  );

  const toggleSpot = useCallback((key: string) => {
    setSelection((previous) => (previous?.kind === "spot" && previous.key === key ? null : { kind: "spot", key }));
  }, []);

  const clear = useCallback(() => {
    setSelection(null);
  }, []);

  return {
    dishes,
    spotByItem,
    resolved,
    // The dish / piece / line that is picked now (null when the picked one is gone).
    selectedDish: resolved?.kind === "dish" && selection?.kind === "dish" ? selection.dish : null,
    selectedInstance: resolved?.kind === "dish" ? (resolved.instance?.number ?? null) : null,
    selectedSpot: resolved?.kind === "spot" ? resolved.spot.key : null,
    toggleDish,
    toggleInstance,
    toggleSpot,
    clear,
  };
}
