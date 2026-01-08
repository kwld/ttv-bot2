

import { ActionType, ActionPlugin } from '../types';

export const PLUGINS: Record<ActionType, ActionPlugin> = {
  [ActionType.CHECK_USER]: {
    type: ActionType.CHECK_USER,
    name: 'Sprawdź Użytkownika (API)',
    description: 'Weryfikuje istnienie użytkownika (Twitch API) i pobiera jego dane (ID, data założenia, avatar).',
    icon: 'fa-user-check',
    category: 'Data',
    aliases: ['user', 'user check', 'check user', 'verify user', 'resolve user', 'znajdz', 'helix', 'użytkownik', 'target', 'sprawdz uzytkownika', 'sprawdz', 'konto', 'account', 'check account', 'whois', 'id'],
    settingsSchema: {
        query: { label: 'Nazwa/ID', type: 'variable', placeholder: '{args.0}' },
        resultVar: { label: 'Zapisz jako', type: 'text', placeholder: 'targetUser', defaultValue: 'targetUser' }
    },
    returns: ['{resultVar}', '{resultVar}.id', '{resultVar}.createdAt', '{resultVar}.viewCount'],
    possibleErrors: ['USER_NOT_FOUND']
  },
  [ActionType.START]: {
    type: ActionType.START,
    name: 'Start Flow',
    description: 'Punkt wejścia komendy. Skonfiguruj triggery.',
    icon: 'fa-play',
    category: 'Triggers',
    aliases: ['begin', 'trigger', 'poczatek'],
    settingsSchema: {
      triggers: { 
        label: 'Wyzwalacze (oddzielone przecinkiem)', 
        type: 'text', 
        placeholder: '!komenda, !alias' 
      },
      eventTriggers: {
        label: 'Auto-Start Events',
        type: 'multiselect',
        options: ['On Message', 'On First Message', 'On Join', 'On Part', 'On Subscription', 'On Raid', 'On Cheer', 'On Follow', 'On Reward Redemption', 'On Channel Update'],
        helperText: 'plugins.START.events_hint'
      },
      defaultDelay: {
        label: 'Globalne opóźnienie startu (s)',
        type: 'number',
        placeholder: '0.6'
      }
    },
    possibleErrors: ['GLOBAL_COOLDOWN', 'USER_COOLDOWN']
  },
  [ActionType.SAY]: {
    type: ActionType.SAY,
    name: 'Say (Wyślij)',
    description: 'Wyślij publiczną wiadomość na czat (Server/Twitch).',
    icon: 'fa-comment-dots',
    category: 'Actions',
    aliases: ['speak', 'mow', 'napisz', 'message', 'text'],
    settingsSchema: {
      message: { 
        label: 'Wiadomość', 
        type: 'variable', 
        inputType: 'textarea', 
        placeholder: 'Cześć @{sender.displayName}!' 
      }
    }
  },
  [ActionType.LOG]: {
    type: ActionType.LOG,
    name: 'System Log (Local)',
    description: 'Wyświetla wiadomość TYLKO w oknie czatu. Obsługuje kolory i spacje.',
    icon: 'fa-terminal',
    category: 'Actions',
    aliases: ['console', 'print', 'debug', 'system', 'info'],
    settingsSchema: {
      message: { 
        label: 'Treść (Widoczna)', 
        type: 'variable', 
        inputType: 'textarea', 
        placeholder: 'Główna wiadomość logu' 
      },
      hoverText: {
        label: 'Szczegóły (Hover, <c#hex>obsługiwane</c>)',
        type: 'variable', 
        inputType: 'textarea',
        placeholder: 'Tekst widoczny po najechaniu myszką'
      },
      level: {
        label: 'Poziom (Styl ramki)',
        type: 'select',
        options: ['info', 'success', 'warning', 'error']
      }
    }
  },
  [ActionType.AI_CHAT]: {
    type: ActionType.AI_CHAT,
    name: 'AI Chat (Gemini)',
    description: 'Generuje inteligentną odpowiedź na podstawie promptu.',
    icon: 'fa-robot',
    category: 'Actions',
    aliases: ['gpt', 'llm', 'bot', 'sztuczna inteligencja'],
    settingsSchema: {
      systemInstruction: {
        label: 'Instrukcja Systemowa (Persona)',
        type: 'variable', 
        inputType: 'textarea',
        placeholder: 'Jesteś pomocnym asystentem...'
      },
      prompt: { 
        label: 'Prompt / Instrukcja', 
        type: 'variable', 
        inputType: 'textarea', 
        placeholder: 'Odpowiedz użytkownikowi @{sender.displayName} na pytanie: {args}' 
      },
      useMemory: {
        label: 'Zachowaj kontekst (Pamięć)',
        type: 'boolean',
        defaultValue: false
      },
      includeContext: {
        label: 'Info o Streamie (Gra/Tytuł)',
        type: 'boolean',
        defaultValue: false
      },
      includeThumbnail: {
        label: 'Widzenie (Analiza Obrazu)',
        type: 'boolean',
        defaultValue: false
      },
      includeSenderContext: {
        label: 'Info o Nadawcy (Ranga/Pkt)',
        type: 'boolean',
        defaultValue: false
      },
      includeUserContext: {
        label: 'Info o Oznaczonym (@user)',
        type: 'boolean',
        defaultValue: false
      },
      memoryId: {
        label: 'Nazwa Kontekstu (np. rpg_session)',
        type: 'text',
        placeholder: 'default',
        defaultValue: 'default'
      },
      model: {
        label: 'Model (Symulacja)',
        type: 'select',
        options: ['Gemini Pro', 'Gemini Flash']
      },
      resultVar: { label: 'Zapisz odpowiedź jako', type: 'text', placeholder: 'ai_response' }
    },
    returns: ['{resultVar}'],
    possibleErrors: ['API_ERROR', 'RATE_LIMIT', 'API_DISABLED_BY_ADMIN']
  },
  [ActionType.EMAIL]: {
    type: ActionType.EMAIL,
    name: 'Wyślij Email',
    description: 'Wysyła wiadomość email (Symulacja/API Serwera).',
    icon: 'fa-envelope',
    category: 'Actions',
    aliases: ['mail', 'poczta', 'wyslij email', 'send email'],
    settingsSchema: {
      to: { label: 'Odbiorca', type: 'variable', placeholder: 'admin@example.com' },
      subject: { label: 'Temat', type: 'variable', placeholder: 'Zgłoszenie od {sender.displayName}' },
      body: { label: 'Treść', type: 'variable', inputType: 'textarea', placeholder: 'Wiadomość: {args}' }
    },
    possibleErrors: ['INVALID_EMAIL', 'SEND_FAILED']
  },
  [ActionType.CREATE_CLIP]: {
    type: ActionType.CREATE_CLIP,
    name: 'Create Clip (Klip)',
    description: 'Tworzy klip z ostatnich 30s streamu (Wymaga Live Server).',
    icon: 'fa-film',
    category: 'Actions',
    aliases: ['clip', 'klip', 'utworz klip', 'highlight'],
    settingsSchema: {
      title: {
        label: 'Tytuł Klipu (Opcjonalne)',
        type: 'variable',
        placeholder: '{args.0}'
      },
      createDelay: {
        label: 'Delay/Duration (0 = Max/1min)',
        type: 'number',
        placeholder: '0'
      },
      resultVar: { 
        label: 'Zapisz URL jako', 
        type: 'text', 
        placeholder: 'clipUrl',
        defaultValue: 'clipUrl' 
      }
    },
    returns: ['{resultVar}', '{resultVar}_edit', '{resultVar}_id'],
    possibleErrors: ['API_ERROR', 'NOT_LIVE', 'NO_PERMISSION']
  },
  [ActionType.WAIT]: {
    type: ActionType.WAIT,
    name: 'Czekaj (Delay)',
    description: 'Zatrzymuje wykonywanie flow na określony czas.',
    icon: 'fa-clock',
    category: 'Flow',
    aliases: ['sleep', 'timer', 'czas', 'opoznienie', 'pause'],
    settingsSchema: {
      duration: { label: 'Czas (sekundy)', type: 'variable', placeholder: '5' }
    }
  },
  [ActionType.WAIT_FOR_KEYWORD]: {
    type: ActionType.WAIT_FOR_KEYWORD,
    name: 'Zbieraj Uczestników',
    description: 'Zbiera użytkowników wpisujących słowa w określonym czasie. Obsługuje wiele słów i Regex.',
    icon: 'fa-hourglass-half',
    category: 'Triggers',
    aliases: ['collect', 'gather', 'wait input', 'czekaj na slowo'],
    producesCollection: true,
    settingsSchema: {
      keyword: { label: 'Hasło / Wyrażenie', type: 'text', placeholder: 'join,gram lub ^join$' },
      duration: { label: 'Czas (sek)', type: 'number', placeholder: '30' },
      maxUsers: { label: 'Limit osób (Opcjonalny)', type: 'number', placeholder: '0 = brak' },
      useRegex: { 
          label: 'Użyj Regex', 
          type: 'boolean',
          helperText: 'plugins.WAIT_FOR_KEYWORD.regex_hint'
      },
      listVar: { label: 'Nazwa Listy (Zmienna)', type: 'text', placeholder: 'participants' }
    },
    returns: ['{listVar}', '{listVar}.length', 'lastKeyword'],
    possibleErrors: ['COLLECTION_EMPTY', 'ALREADY_WAITING']
  },
  [ActionType.WAIT_FOR_USER_REPLY]: {
    type: ActionType.WAIT_FOR_USER_REPLY,
    name: 'Czekaj na Usera',
    description: 'Zatrzymuje flow do momentu, aż konkretny użytkownik wpisze słowo kluczowe.',
    icon: 'fa-comment-medical',
    category: 'Triggers',
    aliases: ['await reply', 'response', 'odpowiedz'],
    settingsSchema: {
      target: { 
          label: 'Użytkownik (User Obj/Nazwa/Puste=Każdy)', 
          type: 'user', 
          placeholder: '@{targetUser} lub pozostaw puste' 
      },
      keyword: { label: 'Słowa (po przecinku)', type: 'text', placeholder: 'tak,nie,zgoda' },
      duration: { label: 'Timeout (sek)', type: 'number', placeholder: '20' },
      resultVar: { label: 'Zapisz odpowiedź jako', type: 'text', placeholder: 'replied_word' }
    },
    returns: ['{resultVar}'],
    possibleErrors: ['WAIT_TIMEOUT', 'ALREADY_WAITING']
  },
  [ActionType.RANDOM_PICK]: {
    type: ActionType.RANDOM_PICK,
    name: 'Losuj Jeden',
    description: 'Wybiera losowy element z kolekcji.',
    icon: 'fa-dice',
    category: 'Logic',
    aliases: ['pick', 'winner', 'wybierz', 'losowanie'],
    requiresCollection: true,
    settingsSchema: {
      source: { label: 'Źródło (lista)', type: 'variable', placeholder: '{participants}' },
      resultVar: { label: 'Zapisz wynik jako', type: 'text', placeholder: 'winner' }
    },
    returns: ['{resultVar}'],
    possibleErrors: ['COLLECTION_EMPTY']
  },
  [ActionType.PICK_MULTIPLE]: {
    type: ActionType.PICK_MULTIPLE,
    name: 'Losuj Kilka',
    description: 'Wybiera określoną liczbę unikalnych elementów.',
    icon: 'fa-dice-d20',
    category: 'Logic',
    aliases: ['pick many', 'winners', 'wielu', 'grupa'],
    requiresCollection: true,
    producesCollection: true,
    settingsSchema: {
      source: { label: 'Źródło (lista)', type: 'variable', placeholder: '{participants}' },
      count: { label: 'Liczba', type: 'number', placeholder: '3' },
      resultVar: { label: 'Zapisz wyniki jako', type: 'text', placeholder: 'winners' }
    },
    returns: ['{resultVar}'],
    possibleErrors: ['COLLECTION_EMPTY']
  },
  [ActionType.RANDOM_NUMBER]: {
    type: ActionType.RANDOM_NUMBER,
    name: 'Losuj Liczbę',
    description: 'Generuje losową liczbę całkowitą z zakresu.',
    icon: 'fa-random',
    category: 'Logic',
    aliases: ['roll', 'dice', 'rzut', 'liczba'],
    settingsSchema: {
      min: { label: 'Minimum', type: 'variable', placeholder: '1' },
      max: { label: 'Maximum', type: 'variable', placeholder: '100' },
      resultVar: { label: 'Zapisz wynik jako', type: 'text', placeholder: 'roll_result' }
    },
    returns: ['{resultVar}']
  },
  [ActionType.RANDOM_EMOTE]: {
    type: ActionType.RANDOM_EMOTE,
    name: 'Losuj Emotkę',
    description: 'Wybiera losową emotkę z dostępnych (Twitch, 7TV, etc.).',
    icon: 'fa-smile',
    category: 'Logic',
    aliases: ['emote', 'kappa', 'random emote'],
    settingsSchema: {
      providers: { 
        label: 'Dostawcy (Opcjonalne)', 
        type: 'multiselect', 
        options: ['Twitch', '7TV', 'BTTV', 'FFZ'] 
      },
      resultVar: { label: 'Zapisz kod jako', type: 'text', placeholder: 'random_emote' }
    },
    returns: ['{resultVar}'],
    possibleErrors: ['NO_EMOTES_FOUND']
  },
  [ActionType.RANDOM_CHATTER]: {
    type: ActionType.RANDOM_CHATTER,
    name: 'Losuj z Czatu',
    description: 'Wybiera losowego użytkownika z bazy danych obecnego kanału.',
    icon: 'fa-users-cog',
    category: 'Logic',
    aliases: ['random user', 'chatter', 'widz', 'random viewer'],
    settingsSchema: {
      allowedRanks: { 
        label: 'Dozwolone Rangi', 
        type: 'multiselect', 
        options: ['Broadcaster', 'Moderator', 'VIP', 'Subscriber', 'Regular'] 
      },
      resultVar: { label: 'Zapisz usera jako', type: 'text', placeholder: 'random_user' }
    },
    returns: ['{resultVar}'],
    possibleErrors: ['NO_USERS_FOUND']
  },
  [ActionType.ITERATE]: {
    type: ActionType.ITERATE,
    name: 'Pętla (Iteracja)',
    description: 'Uruchamia akcje podrzędne dla każdego elementu listy.',
    icon: 'fa-redo',
    category: 'Logic',
    aliases: ['loop', 'foreach', 'each', 'dla kazdego'],
    requiresCollection: true,
    settingsSchema: {
      list: { label: 'Lista do przejścia', type: 'variable', placeholder: '{participants}' },
      varName: { label: 'Zmienna elementu (alias)', type: 'text', placeholder: 'item', defaultValue: 'item' }
    },
    returns: ['item', 'index', '{varName}']
  },
  [ActionType.JOIN_STRING]: {
    type: ActionType.JOIN_STRING,
    name: 'Formatuj Listę (Join)',
    description: 'Łączy listę obiektów/tekstów w jeden ciąg tekstowy wg wzorca.',
    icon: 'fa-list-ol',
    category: 'Data',
    aliases: ['join', 'implode', 'list to string', 'format'],
    requiresCollection: true,
    settingsSchema: {
      list: { label: 'Lista źródłowa', type: 'variable', placeholder: '{topList}' },
      pattern: { label: 'Wzorzec (na element)', type: 'text', placeholder: '{item.displayName} ({item.points})' },
      separator: { label: 'Separator', type: 'text', placeholder: ', ', defaultValue: ', ' },
      iteratorName: { label: 'Nazwa zmiennej (wzoru)', type: 'text', placeholder: 'item', defaultValue: 'item' },
      resultVar: { label: 'Zapisz jako', type: 'text', placeholder: 'formattedList' }
    },
    returns: ['{resultVar}']
  },
  [ActionType.POINTS_GET]: {
    type: ActionType.POINTS_GET,
    name: 'Pobierz Punkty',
    description: 'Pobiera stan waluty użytkownika do zmiennej.',
    icon: 'fa-coins',
    category: 'Data',
    aliases: ['balance', 'get points', 'stan konta', 'wallet'],
    settingsSchema: {
      target: { 
        label: 'Użytkownik', 
        type: 'user', 
        placeholder: '@{sender}',
        helperText: 'plugins.POINTS_GET.target_hint'
      },
      resultVar: { label: 'Zapisz punkty jako', type: 'text', placeholder: 'userPoints' },
      userVar: { label: 'Zapisz obiekt usera jako', type: 'text', placeholder: 'targetUser' }
    },
    returns: ['{resultVar}', '{userVar}'],
    possibleErrors: ['USER_NOT_FOUND']
  },
  [ActionType.POINTS_MODIFY]: {
    type: ActionType.POINTS_MODIFY,
    name: 'Zmień Punkty',
    description: 'Dodaje, odejmuje lub ustawia punkty użytkownikowi.',
    icon: 'fa-plus-minus',
    category: 'Data',
    aliases: ['add points', 'remove points', 'pay', 'zaplac', 'dodaj'],
    settingsSchema: {
      target: { label: 'Użytkownik', type: 'user', placeholder: '@{args.0}' },
      operation: { label: 'Operacja', type: 'select', options: ['add', 'remove', 'set'] },
      amount: { label: 'Ilość', type: 'variable', placeholder: '100' },
      resultVar: { label: 'Zapisz nowy stan jako', type: 'text', placeholder: 'newBalance' },
      userVar: { label: 'Zapisz obiekt usera jako', type: 'text', placeholder: 'targetUser' }
    },
    returns: ['{resultVar}', '{userVar}'],
    possibleErrors: ['USER_NOT_FOUND', 'INSUFFICIENT_FUNDS']
  },
  [ActionType.TOP_USERS]: {
    type: ActionType.TOP_USERS,
    name: 'Ranking (Top Users)',
    description: 'Pobiera posortowaną listę najlepszych użytkowników.',
    icon: 'fa-trophy',
    category: 'Data',
    aliases: ['leaderboard', 'top', 'ranking', 'najlepsi'],
    producesCollection: true,
    settingsSchema: {
      limit: { label: 'Liczba Użytkowników', type: 'number', placeholder: '5' },
      sortBy: { 
          label: 'Sortuj Według', 
          type: 'select', 
          options: ['points', 'messages', 'online'],
          defaultValue: 'points' 
      },
      resultVar: { label: 'Zapisz listę jako', type: 'text', placeholder: 'topList' }
    },
    returns: ['{resultVar}', '{resultVar}.length']
  },
  [ActionType.FETCH_API]: {
    type: ActionType.FETCH_API,
    name: 'API Zewnętrzne',
    description: 'Pobiera dane z adresu URL (JSON).',
    icon: 'fa-globe',
    category: 'Data',
    aliases: ['request', 'http', 'get', 'json'],
    settingsSchema: {
      url: { label: 'URL', type: 'text', placeholder: 'https://api.example.com/data' },
      method: { 
          label: 'Metoda', 
          type: 'select', 
          options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
          defaultValue: 'GET'
      },
      headers: {
          label: 'Headers (Advanced)',
          type: 'key_value_builder'
      },
      bodyType: {
          label: 'Body Type',
          type: 'select',
          options: ['None', 'JSON Builder', 'Raw Text'],
          defaultValue: 'None'
      },
      bodyBuilder: {
          label: 'JSON Body',
          type: 'key_value_builder'
      },
      body: {
          label: 'Raw Body (Text)',
          type: 'variable',
          inputType: 'textarea',
          placeholder: '{"data": "{args.0}"}'
      },
      resultVar: { label: 'Zapisz dane jako', type: 'text', placeholder: 'apiData' }
    },
    returns: ['{resultVar}'],
    possibleErrors: ['API_ERROR', 'API_DISABLED_BY_ADMIN']
  },
  [ActionType.RANK_CHECK]: {
    type: ActionType.RANK_CHECK,
    name: 'Sprawdź Rangę',
    description: 'Blokuje flow jeśli użytkownik nie ma rangi.',
    icon: 'fa-id-badge',
    category: 'Logic',
    aliases: ['permission', 'role', 'uprawnienia', 'mod check'],
    settingsSchema: {
      requiredRanks: { 
        label: 'Wymagane Rangi (Jedna z)', 
        type: 'multiselect', 
        options: ['Broadcaster', 'Moderator', 'VIP', 'Subscriber', 'Regular'] 
      }
    },
    possibleErrors: ['RANK_INSUFFICIENT']
  },
  [ActionType.CONDITION]: {
    type: ActionType.CONDITION,
    name: 'Warunek (Rozgałęzienie)',
    description: 'Zaawansowane warunki (Switch/Case). Sprawdza reguły po kolei.',
    icon: 'fa-code-branch',
    category: 'Logic',
    aliases: ['if', 'else', 'switch', 'case', 'sprawdz'],
    settingsSchema: {
      conditions: { label: 'Reguły', type: 'condition_list' }
    },
    possibleErrors: ['EVALUATION_ERROR']
  },
  [ActionType.CHECK_ARG]: {
    type: ActionType.CHECK_ARG,
    name: 'Sprawdź Argument',
    description: 'Sprawdza czy podano argument (np. nick użytkownika).',
    icon: 'fa-check-square',
    category: 'Logic',
    aliases: ['check arg', 'argument', 'exists', 'czy podano'],
    settingsSchema: {
        argIndex: { label: 'Indeks (0 = pierwszy)', type: 'number', placeholder: '0' }
    }
  },
  [ActionType.SET_VARIABLE]: {
    type: ActionType.SET_VARIABLE,
    name: 'Ustaw Zmienną',
    description: 'Zapisuje wartość do wykorzystania w tym flow.',
    icon: 'fa-save',
    category: 'Data',
    aliases: ['var', 'let', 'set', 'zmienna', 'zapisz'],
    settingsSchema: {
      name: { label: 'Nazwa zmiennej', type: 'text', placeholder: 'temp_var' },
      value: { label: 'Wartość', type: 'variable' }
    }
  },
  [ActionType.CALCULATE]: {
    type: ActionType.CALCULATE,
    name: 'Oblicz (Matma)',
    description: 'Wykonuje proste działania matematyczne (+, -, *, /).',
    icon: 'fa-calculator',
    category: 'Logic',
    aliases: ['math', 'calc', 'oblicz', 'dodaj', 'mnoz'],
    settingsSchema: {
      expression: { label: 'Wyrażenie', type: 'text', placeholder: '{points} * 2 + 100' },
      resultVar: { label: 'Zapisz wynik jako', type: 'text', placeholder: 'calc_result' }
    },
    returns: ['{resultVar}'],
    possibleErrors: ['MATH_ERROR']
  },
  [ActionType.VALIDATE_NUMBER]: {
    type: ActionType.VALIDATE_NUMBER,
    name: 'Parsuj (k, kk, %, all)',
    description: 'Przetwarza liczby, sufiksy (10k, 5m), procenty (50%) i słowo all. Zwraca czystą liczbę.',
    icon: 'fa-filter',
    category: 'Data',
    aliases: ['parse', 'number', 'int', 'amount', 'kwota'],
    settingsSchema: {
      value: { label: 'Wartość do sprawdzenia', type: 'variable', placeholder: '{args.0}' },
      contextUser: { label: 'Kontekst (dla %/all)', type: 'user', placeholder: '@{sender}' },
      allowedTypes: { 
        label: 'Zezwól na', 
        type: 'multiselect', 
        options: ['k', 'kk', '%', 'all'] 
      },
      resultVar: { label: 'Zapisz liczbę jako', type: 'text', placeholder: 'parsedAmount' },
      customError: { label: 'Nazwa błędu (zmienna)', type: 'text', placeholder: 'INVALID_NUMBER' }
    },
    returns: ['error_name', '{resultVar}'],
    possibleErrors: ['INVALID_NUMBER']
  },
  [ActionType.JOIN]: {
    type: ActionType.JOIN,
    name: 'Bariera (Sync)',
    description: 'Czeka na aktywację z wielu źródeł przed przejściem dalej.',
    icon: 'fa-compress-arrows-alt',
    category: 'Flow',
    aliases: ['merge', 'wait all', 'polacz'],
    settingsSchema: {
      requiredInputs: { label: 'Wymagana liczba wejść', type: 'number', placeholder: '2' }
    }
  },
  [ActionType.JUMP]: {
    type: ActionType.JUMP,
    name: 'Skok',
    description: 'Przekierowuje wykonanie do innego węzła.',
    icon: 'fa-share',
    category: 'Flow',
    aliases: ['goto', 'jump', 'przejdz'],
    settingsSchema: {
      targetId: { label: 'ID Celu', type: 'text' }
    },
    isHidden: true
  },
  [ActionType.HANDLE_ERROR]: {
    type: ActionType.HANDLE_ERROR,
    name: 'Obsługa Błędów',
    description: 'Specjalny węzeł, który reaguje na nazwy błędów z poprzedniego węzła.',
    icon: 'fa-bug',
    category: 'Flow',
    aliases: ['catch', 'error', 'blad', 'exception'],
    settingsSchema: {
      cases: { label: 'Mapowanie błędów', type: 'error_mapper' }
    },
    returns: ['error_name']
  },
  [ActionType.HALT]: {
    type: ActionType.HALT,
    name: 'Zatrzymaj Komendy',
    description: 'Przerywa działanie wszystkich aktywnych instancji komend o podanych wyzwalaczach.',
    icon: 'fa-ban',
    category: 'Flow',
    aliases: ['stop', 'cancel', 'przerwij', 'terminate'],
    settingsSchema: {
      triggers: { label: 'Wyzwalacze do zatrzymania (np. !raffle)', type: 'text', placeholder: '!raffle, !losowanie' }
    },
    possibleErrors: ['NO_ACTIVE_EXECUTION']
  }
};
