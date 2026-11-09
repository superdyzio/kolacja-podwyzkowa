import { defineMessages, type Locale } from "@/lib/i18n/locale";
import { PRODUCT_NAME } from "@/lib/i18n/product";
import { OWNER_NAME_MAX, RESTAURANT_NAME_MAX } from "./rules";

// Texts of the platform panel (platform-restaurants, S-10): the page, the island and the API messages, both
// languages (i18n). Pure: islands import this module directly.

export const platformMessages = defineMessages(
  {
    pageTitle: `Panel platformy — ${PRODUCT_NAME}`,
    heading: "Panel platformy",
    intro:
      "Zakładaj restauracje i przekazuj ich właścicielom jednorazowe linki. Aplikacja nie wysyła e-maili: link przekazujesz sam. Danych restauracji (wydarzeń, gości) stąd nie widać.",
    backToPanel: "← Wróć do panelu",
    // New restaurant
    newHeading: "Nowa restauracja",
    nameLabel: "Nazwa restauracji",
    ownerEmailLabel: "E-mail właściciela",
    ownerNameLabel: "Imię i nazwisko właściciela (opcjonalnie)",
    ownerEmailHint: "Na ten e-mail właściciel będzie się logował. Link zaproszenia dostaniesz tutaj.",
    createButton: "Załóż restaurację",
    created: (name: string) => `Restauracja „${name}” założona.`,
    // Validation and API messages
    nameEmpty: "Wpisz nazwę restauracji.",
    nameTooLong: `Nazwa restauracji może mieć najwyżej ${String(RESTAURANT_NAME_MAX)} znaków.`,
    emailInvalid: "To nie wygląda na adres e-mail.",
    ownerNameTooLong: `Imię i nazwisko może mieć najwyżej ${String(OWNER_NAME_MAX)} znaków.`,
    // The list
    listHeading: (count: number) => `Restauracje (${String(count)})`,
    emptyList: "Nie ma jeszcze żadnej restauracji.",
    active: "Aktywna",
    disabled: "Wyłączona",
    disabledHint: "Personel tej restauracji nie ma dostępu do panelu lokalu. Linki jej wydarzeń działają.",
    ownersHeading: "Właściciele",
    noOwner: "Ta restauracja nie ma jeszcze właściciela. Dodaj go poniżej.",
    accountActive: "konto aktywne",
    accountPending: "czeka na ustawienie hasła",
    newLink: "Nowy link",
    newLinkFor: (email: string) => `Nowy link dla ${email}`,
    confirmNewLink: (email: string) =>
      `Wygenerować nowy jednorazowy link dla ${email}? Poprzedni nieużyty link tej osoby przestanie działać. Jeśli ma już hasło, będzie to link do ustawienia nowego hasła — obecne działa, dopóki nie ustawi nowego.`,
    addOwnerHeading: "Dodaj właściciela",
    addOwnerButton: "Dodaj właściciela",
    disable: "Wyłącz",
    enable: "Włącz",
    disableLabel: (name: string) => `Wyłącz restaurację ${name}`,
    enableLabel: (name: string) => `Włącz restaurację ${name}`,
    confirmDisable: (name: string) =>
      `Wyłączyć restaurację „${name}”? Jej personel (właściciele, menedżerowie, kelnerzy) od razu straci dostęp do panelu lokalu. Linki jej wydarzeń — klienta, TV, gości i tabletu obsługi — działają dalej. Możesz ją potem włączyć.`,
    confirmEnable: (name: string) =>
      `Włączyć restaurację „${name}”? Jej personel od razu odzyska dostęp do panelu lokalu.`,
    // Owner result and the one-time link
    inviteLinkFor: (email: string) => `Link zaproszenia dla ${email}`,
    resetLinkFor: (email: string) => `Link do ustawienia nowego hasła dla ${email}`,
    linkValidUntil: (date: string) => `Jednorazowy, ważny do ${date}.`,
    linkHandOver: "Przekaż go tylko tej osobie (aplikacja nie wysyła e-maili).",
    linkOnlyNow:
      "Link widać tylko teraz — po odświeżeniu strony zniknie. W razie potrzeby wygeneruj nowy przyciskiem „Nowy link”.",
    alreadyHasPassword: (email: string) =>
      `Konto ${email} ma już hasło: ta osoba zobaczy restaurację w swoim panelu po zalogowaniu. Jeśli nie pamięta hasła, użyj „Nowy link”.`,
    copy: "Kopiuj",
    copied: "Skopiowano.",
    copySelected: "Link zaznaczony — skopiuj go (Ctrl+C / ⌘C).",
    linkFieldLabel: "Jednorazowy link",
    dismiss: "Zamknij",
    // aria
    listRegion: "Lista restauracji",
    errorRegion: "Błąd",
  },
  {
    pageTitle: `Platform panel — ${PRODUCT_NAME}`,
    heading: "Platform panel",
    intro:
      "Create restaurants and hand their owners one-time links. The app sends no e-mail: you pass the link on yourself. A restaurant's data (events, guests) is not visible from here.",
    backToPanel: "← Back to the panel",
    newHeading: "New restaurant",
    nameLabel: "Restaurant name",
    ownerEmailLabel: "Owner's e-mail",
    ownerNameLabel: "Owner's full name (optional)",
    ownerEmailHint: "The owner will log in with this e-mail. You get the invitation link here.",
    createButton: "Create restaurant",
    created: (name: string) => `Restaurant „${name}” created.`,
    nameEmpty: "Enter the restaurant's name.",
    nameTooLong: `The restaurant's name may have at most ${String(RESTAURANT_NAME_MAX)} characters.`,
    emailInvalid: "This does not look like an e-mail address.",
    ownerNameTooLong: `The full name may have at most ${String(OWNER_NAME_MAX)} characters.`,
    listHeading: (count: number) => `Restaurants (${String(count)})`,
    emptyList: "There are no restaurants yet.",
    active: "Active",
    disabled: "Disabled",
    disabledHint: "This restaurant's staff have no access to the restaurant panel. Its events' links keep working.",
    ownersHeading: "Owners",
    noOwner: "This restaurant has no owner yet. Add one below.",
    accountActive: "account active",
    accountPending: "has not set a password yet",
    newLink: "New link",
    newLinkFor: (email: string) => `New link for ${email}`,
    confirmNewLink: (email: string) =>
      `Generate a new one-time link for ${email}? Their previous unused link will stop working. If they already have a password, this is a link to set a new one — the current password works until they do.`,
    addOwnerHeading: "Add an owner",
    addOwnerButton: "Add owner",
    disable: "Disable",
    enable: "Enable",
    disableLabel: (name: string) => `Disable the restaurant ${name}`,
    enableLabel: (name: string) => `Enable the restaurant ${name}`,
    confirmDisable: (name: string) =>
      `Disable the restaurant „${name}”? Its staff (owners, managers, waiters) lose access to the restaurant panel at once. Its events' links — client, TV, guests and the service tablet — keep working. You can enable it again later.`,
    confirmEnable: (name: string) =>
      `Enable the restaurant „${name}”? Its staff get access to the restaurant panel back at once.`,
    inviteLinkFor: (email: string) => `Invitation link for ${email}`,
    resetLinkFor: (email: string) => `Link to set a new password for ${email}`,
    linkValidUntil: (date: string) => `One-time, valid until ${date}.`,
    linkHandOver: "Give it only to this person (the app sends no e-mail).",
    linkOnlyNow:
      "The link is visible only now — it disappears when the page is reloaded. If needed, make a new one with „New link”.",
    alreadyHasPassword: (email: string) =>
      `The account ${email} already has a password: this person sees the restaurant in their panel after logging in. If they forgot the password, use „New link”.`,
    copy: "Copy",
    copied: "Copied.",
    copySelected: "Link selected — copy it (Ctrl+C / ⌘C).",
    linkFieldLabel: "One-time link",
    dismiss: "Close",
    listRegion: "Restaurant list",
    errorRegion: "Error",
  },
);

// The message of a rule failure (./rules) in the request's language.
export function restaurantNameProblem(reason: "empty" | "too-long", locale: Locale = "pl"): string {
  const t = platformMessages(locale);
  return reason === "empty" ? t.nameEmpty : t.nameTooLong;
}

export function ownerInputProblem(reason: "email" | "name-too-long", locale: Locale = "pl"): string {
  const t = platformMessages(locale);
  return reason === "email" ? t.emailInvalid : t.ownerNameTooLong;
}
