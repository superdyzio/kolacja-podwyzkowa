import { Fragment, useMemo } from "react";
import { DietBadges } from "@/components/diets/DietBadges";
import { DietSection } from "@/components/diets/DietSection";
import { useServingSelection } from "@/components/hooks/useServingSelection";
import { DishInstanceChips } from "@/components/orders/DishInstanceChips";
import { ServingPlan } from "@/components/orders/ServingPlan";
import { dietSeatLookup } from "@/lib/diets/board";
import type { Locale } from "@/lib/i18n";
import { restaurantMessages, servingMessages } from "@/lib/orders/messages";
import { deliveredCount } from "@/lib/orders/pieces";
import { dishKey } from "@/lib/orders/rules";
import { courseLabel } from "@/lib/menu/rules";
import type { ServingSpot } from "@/lib/orders/serving";
import { cn } from "@/lib/utils";
import type { RestaurantItemDto, RestaurantViewDto } from "@/types";

interface Props {
  // The tablet's view, or a staff offline copy of it (staff-offline-readout, S-27).
  view: Omit<RestaurantViewDto, "version">;
  // API base of the page's link (the plan image only gives the aspect ratio).
  apiBase: string;
  locale: Locale;
  // staff-offline-readout: the saved aspect ratio of the plan (used while the image cannot load) and the measured one.
  fallbackAspect?: number;
  onAspect?: (planVersion: number, aspect: number) => void;
}

interface ItemListProps {
  items: readonly RestaurantItemDto[];
  deliveredLabel: string;
  // guest-delivered: „wydane 1 z 2” for a line served in part.
  partlyLabel: (done: number, quantity: number) => string;
  // Lines with a place on the plan are buttons that light it up (serving-highlight).
  spotOf?: (item: RestaurantItemDto) => ServingSpot<RestaurantItemDto> | undefined;
  selectedSpot?: string | null;
  onSelect?: (key: string) => void;
  showLabel?: (dish: string) => string;
}

function ItemList({
  items,
  deliveredLabel,
  partlyLabel,
  spotOf,
  selectedSpot = null,
  onSelect,
  showLabel,
}: ItemListProps) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, index) => {
        const done = deliveredCount(item);
        const partly = done > 0 && !item.delivered;
        const content = (
          <>
            <span className={cn("font-medium", item.delivered && "line-through")}>
              {item.name} × {item.quantity}
            </span>
            {item.note && <span className="text-amber-700 dark:text-amber-400">{item.note}</span>}
            {(item.delivered || partly) && (
              <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                {partly ? partlyLabel(done, item.quantity) : deliveredLabel}
              </span>
            )}
          </>
        );
        const spot = spotOf?.(item);
        const pressed = spot?.key === selectedSpot;
        return (
          <li
            // Lines have no ids here; their order is stable (by id on the server).

            key={index}
            className={cn(item.delivered && "text-muted-foreground")}
          >
            {spot && onSelect ? (
              <button
                type="button"
                aria-pressed={pressed}
                title={showLabel?.(item.name)}
                onClick={() => {
                  onSelect(spot.key);
                }}
                className={cn(
                  "-mx-2 flex min-h-10 w-[calc(100%+1rem)] flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1.5 text-left",
                  "hover:bg-muted focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                  pressed && "bg-red-500/15 ring-2 ring-red-600 hover:bg-red-500/20",
                )}
              >
                {content}
              </button>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-2">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// The kitchen tablet's board (restaurant-orders), shared by the tablet's live page and the staff's offline readout pages
// (staff-offline-readout, S-27): what to prepare (dish × quantity, notes, what is still to serve) and where to serve it
// — the venue drawn from the PUBLISHED seating with the names at the chairs, then every table with its seats' dishes
// and the dishes for the middle of the table. No prices. serving-highlight: a dish of the prep list, one of its pieces
// or a line lights up its places on the plan, which stays in view (beside the lists on wide screens, pinned on top
// while something is picked on narrow ones). guest-import-diets (S-23): „Diety i alergie” (counts and every seat with
// a diet) before the prep list, and the diet next to each seat's name and under a guest found on the plan.
export function RestaurantBoard({ view, apiBase, locale, fallbackAspect, onAspect }: Props) {
  const t = restaurantMessages(locale);
  const s = servingMessages(locale);
  const { seating, placement, prep, diets } = view;
  const dietAt = useMemo(() => dietSeatLookup(diets), [diets]);
  const serving = useServingSelection(placement, prep);
  const byCourse = prep.some((line) => line.course !== null);
  const servingTables = useMemo(() => new Set(placement.tables.map((table) => table.name)), [placement.tables]);
  const spotOf = (item: RestaurantItemDto) => serving.spotByItem.get(item);

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
      <ServingPlan
        apiBase={apiBase}
        seating={seating}
        servingTables={servingTables}
        selection={serving.resolved}
        onClear={serving.clear}
        diets={diets}
        locale={locale}
        fallbackAspect={fallbackAspect}
        onAspect={onAspect}
        className={cn(
          "bg-background lg:sticky lg:top-4 lg:order-2",
          serving.resolved &&
            "sticky top-0 z-10 -mx-4 px-4 py-2 shadow-md sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0 lg:py-0 lg:shadow-none",
        )}
      />
      <div className="flex flex-col gap-8 lg:order-1">
        <DietSection diets={diets} published={seating.publishedAt !== null} locale={locale} />
        <section aria-labelledby="prep-heading" className="flex flex-col gap-3">
          <h2 id="prep-heading" className="text-xl font-semibold">
            {t.prepHeading}
          </h2>
          {prep.length === 0 ? (
            <p className="text-muted-foreground">{t.nothingYet}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-base">
                <thead className="bg-muted text-left text-sm">
                  <tr>
                    <th className="p-2 font-medium">{t.dish}</th>
                    <th className="p-2 text-right font-medium">{t.total}</th>
                    <th className="p-2 text-right font-medium">{t.toServe}</th>
                  </tr>
                </thead>
                <tbody>
                  {prep.map((line, index) => {
                    const key = dishKey(line.name);
                    const dish = serving.dishes.get(key);
                    const picked = serving.selectedDish === key;
                    // menu-catalog-courses (S-16): the kitchen's list by course (headings once any line has one).
                    const heading = byCourse && (index === 0 || prep[index - 1].course !== line.course);
                    return (
                      <Fragment key={`${line.course ?? ""}|${line.name}`}>
                        {heading && (
                          <tr className="bg-muted/60 border-t" data-course={line.course ?? "other"}>
                            <th colSpan={3} scope="colgroup" className="p-2 text-left text-sm font-semibold uppercase">
                              {courseLabel(line.course, locale)}
                            </th>
                          </tr>
                        )}
                        <tr
                          className={cn(
                            "border-t align-top",
                            line.toServe === 0 && "text-muted-foreground",
                            picked && "bg-red-500/10",
                          )}
                        >
                          <td className="p-0">
                            <button
                              type="button"
                              aria-pressed={picked}
                              title={s.showDish(line.name)}
                              onClick={() => {
                                serving.toggleDish(key);
                              }}
                              className={cn(
                                "flex min-h-10 w-full flex-col items-start p-2 text-left",
                                "hover:bg-muted focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
                                picked && "hover:bg-red-500/15",
                              )}
                            >
                              <span className={cn("font-medium", picked && "text-red-700 dark:text-red-400")}>
                                {line.name}
                              </span>
                              {line.notes.map((note) => (
                                <span key={note.note} className="block text-sm text-amber-700 dark:text-amber-400">
                                  {note.quantity} × {note.note}
                                </span>
                              ))}
                            </button>
                          </td>
                          <td className="p-2 text-right">{line.quantity}</td>
                          <td className="p-2 text-right font-semibold">{line.toServe}</td>
                        </tr>
                        {picked && dish && dish.instances.length > 1 && (
                          <tr className="bg-red-500/5">
                            <td colSpan={3} className="p-2">
                              <DishInstanceChips
                                dish={dish}
                                selected={serving.selectedInstance}
                                onSelect={(instance) => {
                                  serving.toggleInstance(key, instance);
                                }}
                                locale={locale}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="serve-heading" className="flex flex-col gap-4">
          <h2 id="serve-heading" className="text-xl font-semibold">
            {t.serveHeading}
          </h2>
          {placement.tables.length === 0 && placement.unplaced.length === 0 && placement.unassigned.length === 0 && (
            <p className="text-muted-foreground">{t.nothingYet}</p>
          )}
          {placement.tables.map((table) => (
            <article
              key={`${table.room} ${table.name}`}
              className="flex flex-col gap-3 rounded-xl border p-4"
              aria-label={t.table(table.name)}
            >
              <h3 className="text-lg font-semibold">
                {table.name} <span className="text-muted-foreground text-sm font-normal">{table.room}</span>
              </h3>
              {table.seats.map((seat) => {
                const diet = dietAt(table.name, seat.seat);
                return (
                  <div key={seat.seat} className="flex flex-col gap-1 border-l-4 border-amber-500/60 pl-3">
                    <h4 className="text-muted-foreground text-sm">
                      {`${t.seat(seat.seat)} · `}
                      <span className="text-foreground font-semibold">{seat.guestName}</span>
                      {diet && <DietBadges diets={diet.diets} note={diet.note} locale={locale} className="ml-2" />}
                    </h4>
                    <ItemList
                      deliveredLabel={t.delivered}
                      partlyLabel={t.partlyServed}
                      items={seat.items}
                      spotOf={spotOf}
                      selectedSpot={serving.selectedSpot}
                      onSelect={serving.toggleSpot}
                      showLabel={s.showLine}
                    />
                  </div>
                );
              })}
              {table.tableItems.length > 0 && (
                <div className="flex flex-col gap-1 border-l-4 border-sky-500/60 pl-3">
                  <h4 className="text-sm font-semibold">{t.middleOfTable}</h4>
                  <ItemList
                    deliveredLabel={t.delivered}
                    partlyLabel={t.partlyServed}
                    items={table.tableItems}
                    spotOf={spotOf}
                    selectedSpot={serving.selectedSpot}
                    onSelect={serving.toggleSpot}
                    showLabel={s.showLine}
                  />
                </div>
              )}
            </article>
          ))}
          {placement.unplaced.length > 0 && (
            <article
              className="flex flex-col gap-3 rounded-xl border border-amber-500/50 p-4"
              aria-label={t.unplacedLabel}
            >
              <header className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold">{t.unplacedHeading}</h3>
                <p className="text-muted-foreground text-sm">{t.unplacedText}</p>
              </header>
              {placement.unplaced.map((group) => (
                <div key={`${group.kind} ${group.name}`} className="flex flex-col gap-1 pl-3">
                  <h4 className="text-sm font-semibold">{group.kind === "guest" ? group.name : t.table(group.name)}</h4>
                  <ItemList deliveredLabel={t.delivered} partlyLabel={t.partlyServed} items={group.items} />
                </div>
              ))}
            </article>
          )}
          {placement.unassigned.length > 0 && (
            <article className="flex flex-col gap-3 rounded-xl border p-4" aria-label={t.unassignedLabel}>
              <h3 className="text-lg font-semibold">{t.unassignedHeading}</h3>
              <ItemList deliveredLabel={t.delivered} partlyLabel={t.partlyServed} items={placement.unassigned} />
            </article>
          )}
        </section>
      </div>
    </div>
  );
}
