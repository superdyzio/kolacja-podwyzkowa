import { defineMessages } from "@/lib/i18n";

// Texts of the TV's room view and of the per-room TV links (tv-room-rotation, S-20).
export const tvRoomMessages = defineMessages(
  {
    // The rotation indicator: "2 / 4".
    position: (index: number, count: number) => `${String(index + 1)} / ${String(count)}`,
    positionLabel: (index: number, count: number, room: string) =>
      `Sala ${String(index + 1)} z ${String(count)}: ${room}`,
    pinnedLabel: (room: string) => `Sala: ${room}`,
    linksHeading: "Link TV dla jednej sali",
    linksHint:
      "Każdy telewizor może pokazywać jedną salę: otwórz na nim link tej sali. Link główny pokazuje cały lokal, a gdy imiona byłyby za małe — kolejno wszystkie sale.",
    copy: "Kopiuj",
    copied: "Skopiowano.",
    copySelected: "Zaznaczono link — skopiuj go ręcznie.",
    copyLabel: (room: string) => `Kopiuj link TV sali ${room}`,
    open: "Otwórz",
    openLabel: (room: string) => `Otwórz TV sali ${room}`,
  },
  {
    position: (index: number, count: number) => `${String(index + 1)} / ${String(count)}`,
    positionLabel: (index: number, count: number, room: string) =>
      `Room ${String(index + 1)} of ${String(count)}: ${room}`,
    pinnedLabel: (room: string) => `Room: ${room}`,
    linksHeading: "TV link for one room",
    linksHint:
      "Each TV can show one room: open that room's link on it. The main link shows the whole venue, and when names would be too small, every room in turn.",
    copy: "Copy",
    copied: "Copied.",
    copySelected: "Link selected — copy it by hand.",
    copyLabel: (room: string) => `Copy the TV link of room ${room}`,
    open: "Open",
    openLabel: (room: string) => `Open the TV of room ${room}`,
  },
);
