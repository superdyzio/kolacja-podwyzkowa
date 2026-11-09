import { defineMessages, type Locale } from "@/lib/i18n/locale";
import { PRODUCT_NAME } from "@/lib/i18n/product";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./limits";

// Texts of the staff pages and APIs (staff-accounts, F-03), both languages (i18n). Pure: no node:crypto, so any page
// or island may import this module directly.

export type StaffRole = "owner" | "manager" | "waiter";

export const authMessages = defineMessages(
  {
    // /logowanie
    loginTitle: `Logowanie — ${PRODUCT_NAME}`,
    loginHeading: "Logowanie dla personelu",
    loginIntro: "Konto zakłada się z linku zaproszenia. Zaloguj się e-mailem i hasłem.",
    emailLabel: "E-mail",
    passwordLabel: "Hasło",
    loginButton: "Zaloguj się",
    forgotHint: "Nie pamiętasz hasła? Poproś właściciela lub menedżera lokalu o link do ustawienia nowego.",
    loggedOut: "Wylogowano.",
    // /haslo/<token>
    setPasswordTitle: `Ustaw hasło — ${PRODUCT_NAME}`,
    inviteHeading: "Ustaw hasło do swojego konta",
    resetHeading: "Ustaw nowe hasło",
    accountFor: (email: string) => `Konto: ${email}`,
    newPasswordLabel: "Nowe hasło",
    repeatPasswordLabel: "Powtórz nowe hasło",
    passwordHint: `Co najmniej ${String(PASSWORD_MIN_LENGTH)} znaków. Po zapisaniu od razu się zalogujesz.`,
    newPasswordHint: `Co najmniej ${String(PASSWORD_MIN_LENGTH)} znaków.`,
    setPasswordButton: "Ustaw hasło i zaloguj się",
    invalidLinkTitle: "Link nieważny",
    invalidLinkText:
      "Ten link już nie działa: został użyty, wygasł albo jest niepełny. Poproś osobę, od której go masz, o nowy.",
    goToLogin: "Przejdź do logowania",
    // /panel
    panelTitle: `Panel — ${PRODUCT_NAME}`,
    panelHeading: "Panel",
    signedInAs: "Zalogowano jako",
    platformAdmin: "Administrator platformy",
    restaurantsHeading: "Twoje restauracje",
    noRestaurants: "Nie należysz jeszcze do żadnej restauracji.",
    // platform-restaurants (S-10): entry points and the disabled state
    platformCardHeading: "Panel platformy",
    platformCardText: "Restauracje na platformie, zaproszenia właścicieli, włączanie i wyłączanie restauracji.",
    openPlatformPanel: "Otwórz panel platformy",
    openRestaurantPanel: "Otwórz panel lokalu",
    openRestaurantPanelFor: (name: string) => `Otwórz panel lokalu ${name}`,
    restaurantDisabled: "Wyłączona",
    restaurantDisabledNote: "Administrator platformy wyłączył tę restaurację. Skontaktuj się z nim, aby ją włączyć.",
    roleLabels: { owner: "Właściciel", manager: "Menedżer", waiter: "Kelner" } satisfies Record<StaffRole, string>,
    changePasswordHeading: "Zmień hasło",
    changePasswordHint: "Po zmianie hasła inne urządzenia zostaną wylogowane; to zostaje zalogowane.",
    currentPasswordLabel: "Obecne hasło",
    changePasswordButton: "Zmień hasło",
    passwordChanged: "Hasło zmienione. Inne urządzenia zostały wylogowane.",
    sessionHeading: "Sesja",
    sessionHint: "Logowanie trwa 30 dni na tym urządzeniu.",
    logoutButton: "Wyloguj",
    logoutEverywhereButton: "Wyloguj ze wszystkich urządzeń",
    // Errors (?blad=<code>)
    errors: {
      dane: "Nieprawidłowy e-mail lub hasło.",
      limit: "Zbyt wiele nieudanych prób. Spróbuj ponownie za kilkanaście minut.",
      baza: "Logowanie jest chwilowo niedostępne. Spróbuj za chwilę.",
      krotkie: `Hasło musi mieć co najmniej ${String(PASSWORD_MIN_LENGTH)} znaków.`,
      dlugie: `Hasło może mieć najwyżej ${String(PASSWORD_MAX_LENGTH)} znaków.`,
      rozne: "Hasła się różnią. Wpisz to samo hasło dwa razy.",
      obecne: "Obecne hasło jest nieprawidłowe.",
    },
    // API answers
    noSession: "Zaloguj się, aby kontynuować.",
    forbiddenOrigin: "Żądanie odrzucone: nie pochodzi z tej strony.",
    // aria
    errorRegion: "Błąd",
    noticeRegion: "Komunikat",
  },
  {
    loginTitle: `Log in — ${PRODUCT_NAME}`,
    loginHeading: "Staff login",
    loginIntro: "Accounts are created from an invitation link. Log in with your e-mail and password.",
    emailLabel: "E-mail",
    passwordLabel: "Password",
    loginButton: "Log in",
    forgotHint: "Forgot your password? Ask the restaurant's owner or manager for a link to set a new one.",
    loggedOut: "You have been logged out.",
    setPasswordTitle: `Set password — ${PRODUCT_NAME}`,
    inviteHeading: "Set the password for your account",
    resetHeading: "Set a new password",
    accountFor: (email: string) => `Account: ${email}`,
    newPasswordLabel: "New password",
    repeatPasswordLabel: "Repeat the new password",
    passwordHint: `At least ${String(PASSWORD_MIN_LENGTH)} characters. You will be logged in right after saving.`,
    newPasswordHint: `At least ${String(PASSWORD_MIN_LENGTH)} characters.`,
    setPasswordButton: "Set password and log in",
    invalidLinkTitle: "Invalid link",
    invalidLinkText:
      "This link no longer works: it was used, it expired or it is incomplete. Ask the person who gave it to you for a new one.",
    goToLogin: "Go to the login page",
    panelTitle: `Panel — ${PRODUCT_NAME}`,
    panelHeading: "Panel",
    signedInAs: "Logged in as",
    platformAdmin: "Platform administrator",
    restaurantsHeading: "Your restaurants",
    noRestaurants: "You are not a member of any restaurant yet.",
    platformCardHeading: "Platform panel",
    platformCardText: "Restaurants on the platform, owner invitations, enabling and disabling restaurants.",
    openPlatformPanel: "Open the platform panel",
    openRestaurantPanel: "Open the restaurant panel",
    openRestaurantPanelFor: (name: string) => `Open the restaurant panel of ${name}`,
    restaurantDisabled: "Disabled",
    restaurantDisabledNote: "The platform administrator has disabled this restaurant. Contact them to enable it again.",
    roleLabels: { owner: "Owner", manager: "Manager", waiter: "Waiter" },
    changePasswordHeading: "Change password",
    changePasswordHint: "Changing the password logs out your other devices; this one stays logged in.",
    currentPasswordLabel: "Current password",
    changePasswordButton: "Change password",
    passwordChanged: "Password changed. Your other devices have been logged out.",
    sessionHeading: "Session",
    sessionHint: "A login lasts 30 days on this device.",
    logoutButton: "Log out",
    logoutEverywhereButton: "Log out on all devices",
    errors: {
      dane: "Wrong e-mail or password.",
      limit: "Too many failed attempts. Try again in about fifteen minutes.",
      baza: "Logging in is unavailable right now. Try again in a moment.",
      krotkie: `The password must have at least ${String(PASSWORD_MIN_LENGTH)} characters.`,
      dlugie: `The password may have at most ${String(PASSWORD_MAX_LENGTH)} characters.`,
      rozne: "The passwords differ. Type the same password twice.",
      obecne: "The current password is wrong.",
    },
    noSession: "Log in to continue.",
    forbiddenOrigin: "Request refused: it does not come from this site.",
    errorRegion: "Error",
    noticeRegion: "Notice",
  },
);

export type AuthErrorCode = "dane" | "limit" | "baza" | "krotkie" | "dlugie" | "rozne" | "obecne";

const ERROR_CODES = new Set<string>(["dane", "limit", "baza", "krotkie", "dlugie", "rozne", "obecne"]);

export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return typeof value === "string" && ERROR_CODES.has(value);
}

// The text for a `?blad=` code, or null for a missing or unknown code (an unknown code shows nothing).
export function authErrorText(code: string | null, locale: Locale = "pl"): string | null {
  return isAuthErrorCode(code) ? authMessages(locale).errors[code] : null;
}
