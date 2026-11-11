import type { ReactNode } from "react";
import { useGuestState } from "@/components/hooks/useGuestState";
import type { GuestModules } from "@/lib/modules/rules";
import type { GuestStateDto } from "@/types";

// A guest page section that belongs to a module (event-modules, S-17): hidden while the module is off, shown again
// when it is on — read from the ONE shared guest poll (no request of its own), so a module switched off mid-evening
// disappears on the phone's next poll. The section stays mounted (only `hidden`), so its island keeps its state.
// A state without `modules` (an answer of older code) counts as on.
interface Props {
  apiBase: string;
  initial: GuestStateDto;
  module: keyof GuestModules;
  children?: ReactNode;
}

export function GuestModuleGate({ apiBase, initial, module, children }: Props) {
  const { state } = useGuestState(apiBase, initial);
  // Typed as always present, but an answer of older code (during a deploy) may lack it; no state (no access) = on,
  // the islands inside say why.
  const current: Partial<GuestStateDto> | null = state;
  const on = current?.modules ? current.modules[module] : true;
  return (
    <div hidden={!on} data-guest-module={module} className="contents">
      {children}
    </div>
  );
}
