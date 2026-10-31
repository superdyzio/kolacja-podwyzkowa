import type { QuestionCategory } from "@/types";

// What the mock AI provider answers (S-08): plausible Polish topics per category, within the content bounds (checked
// by mock-topics.test.ts against src/lib/questions/bounds.ts). Used in dev, tests, the smoke and the overnight build —
// until the user adds an API key, the evening runs on these. Gender-neutral wording where possible.
export const MOCK_TOPICS: Readonly<Record<QuestionCategory, readonly string[]>> = {
  kontrowersyjne: [
    "Czy praca zdalna to przyszłość, czy wygodna wymówka, żeby mniej się starać?",
    "Czy lepiej zarabiać dużo w nudnej pracy, czy mało w pracy, która naprawdę cieszy?",
    "Czy szczerość w pracy zawsze się opłaca, czy czasem lepiej coś przemilczeć?",
    "Czy ananas na pizzy to kulinarna zbrodnia, czy genialny pomysł?",
    "Czy influencer to prawdziwy zawód, czy tylko dobrze opłacane hobby?",
    "Czy w związku lepiej mieć wspólne konto, czy osobne pieniądze?",
    "Czy napiwek powinien być oczywistością, czy nagrodą tylko za wyjątkową obsługę?",
    "Czy sztuczna inteligencja odbierze nam ciekawsze zadania, czy tylko te nudne?",
    "Czy cztery dni pracy w tygodniu to realny plan, czy piękna utopia?",
    "Czy odkładanie telefonów na czas spotkania ze znajomymi to dobry zwyczaj, czy przesada?",
    "Czy warto pożyczać pieniądze przyjaciołom, czy to najprostsza droga do kłótni?",
    "Czy lepszy jest szef-kumpel, czy szef, który trzyma dystans?",
  ],
  generyczne: [
    "Jaką supermoc wybierasz na jeden zwykły dzień w pracy i do czego jej używasz?",
    "Gdyby Twoje życie było filmem, jaki miałoby tytuł i kto zagrałby główną rolę?",
    "Jakie danie potrafisz przygotować z zamkniętymi oczami?",
    "Który wynalazek ostatnich lat najbardziej ułatwia Ci codzienność?",
    "Dokąd ruszasz jutro, jeśli bilet w dowolne miejsce jest już opłacony?",
    "Jaka piosenka zawsze poprawia Ci humor, nawet w poniedziałek rano?",
    "Jakie hobby chcesz zacząć, ale ciągle odkładasz je na później?",
    "Jaka była najdziwniejsza rzecz, którą udało Ci się kupić przez internet?",
    "Które zwierzę najlepiej pasuje do Twojego charakteru i dlaczego?",
    "Jaki serial możesz oglądać bez końca i nigdy Ci się nie nudzi?",
    "Kuchnia jednego kraju do końca roku — którą wybierasz i dlaczego?",
    "Jaka gra planszowa albo karciana budzi w Tobie najwięcej emocji?",
  ],
  refleksyjne: [
    "Jaka decyzja sprzed lat najbardziej zmieniła kierunek Twojego życia?",
    "Czego nauczyła Cię pierwsza praca, co przydaje Ci się do dziś?",
    "Co chcesz robić za dziesięć lat, czego dziś jeszcze nie robisz?",
    "Jaką radę dajesz dziś sobie sprzed dziesięciu lat?",
    "Jakie małe codzienne przyjemności są dla Ciebie najważniejsze?",
    "Za co czujesz dziś największą wdzięczność?",
    "Z jakiej swojej umiejętności, której nikt nie zauważa, czujesz dumę?",
    "Co w Twoim życiu jest dziś prostsze, niż wydawało się dziesięć lat temu?",
    "Jaka osoba spoza rodziny najbardziej wpłynęła na to, kim dziś jesteś?",
    "Co oznacza dla Ciebie sukces i czy ta definicja zmieniała się z czasem?",
    "Gdyby jutro czekał Cię zupełnie wolny rok, na co go przeznaczysz?",
    "Jakie wspomnienie z dzieciństwa wraca do Ciebie najczęściej i dlaczego?",
  ],
};
