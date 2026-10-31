import type { TvSpotlightControls } from "@/components/hooks/useTvSpotlight";
import { Button } from "@/components/ui/button";

interface Props {
  tv: TvSpotlightControls;
  kind: "question" | "topic";
  text: string;
}

// „Pokaż na TV” under the organizer's drawn question or AI topic (tv-spotlight); once it is on the TV the button says
// so. Only the organizer's questions page renders it — never the guest's phone.
export function ShowOnTvButton({ tv, kind, text }: Props) {
  const onTv = tv.spotlight?.kind === kind && tv.spotlight.text === text;
  return (
    <Button
      type="button"
      variant="outline"
      className="h-12 self-start text-base"
      disabled={tv.pending || onTv}
      onClick={() => void tv.show(kind, text)}
    >
      {onTv ? "Jest na TV ✓" : "Pokaż na TV"}
    </Button>
  );
}
