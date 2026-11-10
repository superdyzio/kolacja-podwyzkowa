import { defineMessages } from "@/lib/i18n/locale";

// Texts of the restaurant team (restaurant-team, S-12): the „Zespół” section of /panel/restauracje/<id>, its island
// and the team API's messages, both languages (i18n). Role names come from authMessages().roleLabels; the one-time
// link card's texts from platformMessages (StaffLinkCard). Pure: islands import this module directly.

export const teamMessages = defineMessages(
  {
    heading: "Zespół",
    intro: "Zapraszaj osoby do zespołu jednorazowym linkiem. Aplikacja nie wysyła e-maili: link przekazujesz sam.",
    ownerScope:
      "Jako właściciel zapraszasz menedżerów i kelnerów, zmieniasz role (także na właściciela), usuwasz osoby z zespołu i dajesz link do ustawienia nowego hasła. Restauracja zawsze ma co najmniej jednego właściciela.",
    managerScope:
      "Jako menedżer zapraszasz i usuwasz kelnerów i dajesz im link do ustawienia nowego hasła. Menedżerami i właścicielami zarządza właściciel.",
    // Invitation
    inviteHeading: "Zaproś do zespołu",
    emailLabel: "E-mail",
    emailHint: "Na ten e-mail ta osoba będzie się logować. Link zaproszenia zobaczysz tutaj.",
    nameLabel: "Imię i nazwisko (opcjonalnie)",
    roleLabel: "Rola",
    inviteButton: "Zaproś",
    invited: (email: string) => `${email} jest w zespole.`,
    hasAccount: (email: string) =>
      `${email} ma już konto: zobaczy restaurację w swoim panelu po zalogowaniu (albo po ustawieniu hasła z linku, który już dostała). Link zaproszenia nie jest potrzebny.`,
    // The list
    listHeading: (count: number) => `Osoby w zespole (${String(count)})`,
    you: "Ty",
    accountActive: "konto aktywne",
    accountPending: "czeka na ustawienie hasła",
    roleSelectLabel: (email: string) => `Rola: ${email}`,
    lastOwnerHint: "Jedyny właściciel — najpierw nadaj rolę właściciela komuś innemu.",
    remove: "Usuń z zespołu",
    removeLabel: (email: string) => `Usuń ${email} z zespołu`,
    newLink: "Nowy link",
    newLinkLabel: (email: string) => `Nowy link dla ${email}`,
    roleChanged: (email: string, role: string) => `${email}: rola zmieniona na „${role}”.`,
    removed: (email: string) => `${email} nie jest już w zespole.`,
    // Confirms
    confirmRemove: (email: string) =>
      `Usunąć ${email} z zespołu? Ta osoba od razu straci dostęp do tej restauracji (inne restauracje, w których pracuje, zostają). Możesz ją potem zaprosić ponownie.`,
    confirmRemoveSelf: "Usunąć siebie z zespołu? Od razu stracisz dostęp do tej restauracji.",
    confirmRole: (email: string, role: string) => `Zmienić rolę ${email} na „${role}”?`,
    confirmPromoteOwner: (email: string) =>
      `Nadać ${email} rolę właściciela? Właściciel ma pełną władzę nad restauracją: zespół (także innych właścicieli), wydarzenia i ich trwałe usuwanie.`,
    confirmDemoteSelf: (role: string) =>
      `Zmienić swoją rolę na „${role}”? Stracisz uprawnienia właściciela w tej restauracji.`,
    confirmNewLink: (email: string) =>
      `Wygenerować nowy jednorazowy link dla ${email}? Poprzedni nieużyty link tej osoby przestanie działać. Jeśli ma już hasło, będzie to link do ustawienia nowego hasła: obecne działa, dopóki nie ustawi nowego, a potem jej inne urządzenia zostaną wylogowane.`,
    // API messages
    lastOwner: "Restauracja musi mieć co najmniej jednego właściciela. Najpierw nadaj rolę właściciela komuś innemu.",
    alreadyMember: "Ta osoba już jest w zespole. Jej rolę zmienisz na liście.",
    elsewhere:
      "Ta osoba ma dostęp także do innej restauracji, więc link do ustawienia hasła może jej dać tylko administrator platformy.",
    // Lost access
    lost: "Nie zarządzasz już zespołem tej restauracji.",
    backToPanel: "Wróć do panelu",
    dismiss: "Zamknij",
  },
  {
    heading: "Team",
    intro: "Invite people to the team with a one-time link. The app sends no e-mail: you hand the link over yourself.",
    ownerScope:
      "As an owner you invite managers and waiters, change roles (also to owner), remove people from the team and give them a link to set a new password. The restaurant always keeps at least one owner.",
    managerScope:
      "As a manager you invite and remove waiters and give them a link to set a new password. Managers and owners are managed by an owner.",
    inviteHeading: "Invite to the team",
    emailLabel: "E-mail",
    emailHint: "The person will log in with this e-mail. You will see the invitation link here.",
    nameLabel: "Name (optional)",
    roleLabel: "Role",
    inviteButton: "Invite",
    invited: (email: string) => `${email} is in the team.`,
    hasAccount: (email: string) =>
      `${email} already has an account: the restaurant shows up in their panel after they log in (or after they set the password from the link they already have). No invitation link is needed.`,
    listHeading: (count: number) => `People in the team (${String(count)})`,
    you: "You",
    accountActive: "account active",
    accountPending: "has not set a password yet",
    roleSelectLabel: (email: string) => `Role: ${email}`,
    lastOwnerHint: "The only owner — give the owner role to someone else first.",
    remove: "Remove from the team",
    removeLabel: (email: string) => `Remove ${email} from the team`,
    newLink: "New link",
    newLinkLabel: (email: string) => `New link for ${email}`,
    roleChanged: (email: string, role: string) => `${email}: role changed to “${role}”.`,
    removed: (email: string) => `${email} is no longer in the team.`,
    confirmRemove: (email: string) =>
      `Remove ${email} from the team? They lose access to this restaurant at once (other restaurants they work for stay). You can invite them again later.`,
    confirmRemoveSelf: "Remove yourself from the team? You lose access to this restaurant at once.",
    confirmRole: (email: string, role: string) => `Change the role of ${email} to “${role}”?`,
    confirmPromoteOwner: (email: string) =>
      `Make ${email} an owner? An owner has full control of the restaurant: the team (other owners included), the events and deleting them permanently.`,
    confirmDemoteSelf: (role: string) =>
      `Change your own role to “${role}”? You lose the owner's rights in this restaurant.`,
    confirmNewLink: (email: string) =>
      `Generate a new one-time link for ${email}? Their earlier unused link stops working. If they already have a password, this is a link to set a new one: the current password works until they set it, then their other devices are logged out.`,
    lastOwner: "The restaurant needs at least one owner. Give the owner role to someone else first.",
    alreadyMember: "This person is already in the team. Change their role in the list.",
    elsewhere:
      "This person also has access to another restaurant, so only the platform administrator can give them a link to set a password.",
    lost: "You no longer manage this restaurant's team.",
    backToPanel: "Back to the panel",
    dismiss: "Close",
  },
);
