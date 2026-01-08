
export const plugins = {
  plugins: {
    START: { name: "Start Flow", desc: "Punkt wejścia. Skonfiguruj triggery." },
    SAY: { name: "Powiedz (Wyślij)", desc: "Wyślij publiczną wiadomość na czat." },
    LOG: { name: "Log Systemowy", desc: "Log widoczny tylko w konsoli." },
    AI_CHAT: { name: "Czat AI (Gemini)", desc: "Generuj inteligentną odpowiedź." },
    EMAIL: { name: "Wyślij Email", desc: "Wysyła wiadomość email (Symulacja/API Serwera)." },
    WAIT: { name: "Czekaj (Opóźnienie)", desc: "Wstrzymaj wykonywanie flow." },
    WAIT_FOR_KEYWORD: { 
        name: "Czekaj na Słowo", 
        desc: "Zbieraj użytkowników wpisujących słowa kluczowe.",
        regex_hint: "Jeśli włączone, słowa są traktowane jako wzorce RegEx (np. ^start pasuje tylko na początku)."
    },
    WAIT_FOR_USER_REPLY: { name: "Czekaj na Odpowiedź", desc: "Czekaj na odpowiedź konkretnego użytkownika." },
    RANDOM_PICK: { name: "Losuj Jeden", desc: "Wybierz losowy element z listy." },
    PICK_MULTIPLE: { name: "Losuj Kilka", desc: "Wybierz wiele unikalnych elementów." },
    RANDOM_NUMBER: { name: "Losowa Liczba", desc: "Generuj liczbę z zakresu." },
    RANDOM_EMOTE: { name: "Losowa Emotka", desc: "Wybierz losową emotkę z kanału." },
    RANDOM_CHATTER: { name: "Losowy Widz", desc: "Wybierz losowego aktywnego użytkownika." },
    ITERATE: { name: "Pętla (Iteracja)", desc: "Wykonaj akcje dla każdego elementu." },
    JOIN_STRING: { name: "Formatuj Listę (Join)", desc: "Połącz listę obiektów w tekst wg wzorca." },
    POINTS_GET: { 
        name: "Pobierz Punkty", 
        desc: "Sprawdź stan konta użytkownika.",
        target_hint: "Jeśli puste/brak argumentu, pobiera dla nadawcy."
    },
    POINTS_MODIFY: { name: "Zmień Punkty", desc: "Dodaj, odejmij lub ustaw punkty." },
    TOP_USERS: { name: "Ranking (Top Users)", desc: "Pobierz listę najlepszych użytkowników." },
    FETCH_API: { name: "Pobierz API", desc: "Pobierz dane JSON z URL." },
    CREATE_CLIP: { name: "Utwórz Klip (Twitch)", desc: "Generuje klip z ostatnich 30s streamu. Wymaga Live Server." },
    CHECK_USER: { name: "Sprawdź Użytkownika", desc: "Weryfikuje istnienie użytkownika (Twitch API) i pobiera jego dane." },
    RANK_CHECK: { name: "Sprawdź Rangę", desc: "Weryfikacja uprawnień użytkownika." },
    CONDITION: { name: "Warunek", desc: "Rozgałęzienie logiki (If/Else)." },
    SET_VARIABLE: { name: "Ustaw Zmienną", desc: "Zapisz wartość w pamięci." },
    CALCULATE: { name: "Oblicz (Matma)", desc: "Działania matematyczne." },
    VALIDATE_NUMBER: { name: "Parsuj Liczbę", desc: "Obsługa sufiksów (k, m, %, all)." },
    JOIN: { name: "Bariera (Sync)", desc: "Czekaj na wiele wejść." },
    JUMP: { name: "Skok (Jump)", desc: "Przejdź do innego węzła." },
    HANDLE_ERROR: { name: "Obsługa Błędów", desc: "Przechwyć błędy z poprzedniego węzła." },
    HALT: { name: "Zatrzymaj", desc: "Przerwij działanie komend." }
  }
};