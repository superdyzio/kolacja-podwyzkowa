import { defineMessages } from "@/lib/i18n/locale";

// The no-access texts (PRD Access Control), shared by the NoAccess page, the API denials and the guest phone view when
// a poll finds that access is gone (switched off or link revoked). The same words for every denial: they never say
// why. The language comes from the path prefix and the cookie, never from the key (i18n).
export const noAccessMessages = defineMessages(
  {
    title: "Brak dostępu",
    text: "Ta strona jest dostępna tylko przez link od organizatora.",
    hint: "Masz karteczkę lub link od organizatora? Dostęp gości może być jeszcze wyłączony albo link został wymieniony — zapytaj organizatora.",
  },
  {
    title: "No access",
    text: "This page is only available through a link from the organizer.",
    hint: "Got a card or a link from the organizer? Guest access may still be switched off, or the link was replaced — ask the organizer.",
  },
);
