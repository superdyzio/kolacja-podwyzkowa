import { Pin } from "lucide-react";

interface Props {
  pinned?: boolean;
  absent?: boolean;
  // The other present-or-absent members of the guest's inseparable group.
  partners: string[];
}

// Small text markers next to a name: pinned (with a pin icon — never colour alone), absent, member of a group.
export function GuestMarkers({ pinned = false, absent = false, partners }: Props) {
  if (!pinned && !absent && partners.length === 0) {
    return null;
  }
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
      {pinned && (
        <span className="text-primary inline-flex items-center gap-0.5 font-medium">
          <Pin aria-hidden className="size-3" />
          przypięty
        </span>
      )}
      {absent && <span className="text-muted-foreground">nieobecny</span>}
      {partners.length > 0 && (
        <span className="text-muted-foreground" title={`Razem z: ${partners.join(", ")}`}>
          {partners.length === 1 ? "para" : "grupa"}
          <span className="sr-only"> z: {partners.join(", ")}</span>
        </span>
      )}
    </span>
  );
}
