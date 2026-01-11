export const CMD_VOTE_YAML = `
id: mod-vote
name: Głosowanie (Vote)
category: Moderation
version: '2.3'
provider: twitch
channelId: sim_1
enabled: true
testAsUser: false
allowedRanks:
  - moderator
  - broadcaster
staticVariables: {}
args:
  - name: Opcje (po przecinku)
    type: text
    optional: false
globalCooldown: 0
userCooldown: 0
isBuiltIn: true
usageHint: '!createvote opcja1, opcja2'
rootAction:
  id: root-vote
  type: START
  settings:
    triggers: '!createvote, !startvote'
    onlyOnline: true
  position:
    x: 280
    y: 100
  children:
    - id: rank-check
      type: RANK_CHECK
      settings:
        requiredRanks:
          - Moderator
          - Broadcaster
      position:
        x: 640
        y: 100
      errorChildren:
        - id: perm-error
          type: SAY
          settings:
            message: ⛔ Brak uprawnień do tworzenia głosowania.
          position:
            x: 1020
            y: 380
          children: []
      children:
        - id: check-args
          type: CONDITION
          settings:
            conditions:
              - id: has_options
                name: Podano opcje
                left: '{args.length}'
                op: '>'
                right: '0'
          position:
            x: 1020
            y: 100
          children: []
          branches:
            has_options:
              - id: create-options-list
                type: CREATE_LIST
                settings:
                  input: '{args.all}'
                  separator: ','
                  resultVar: voteOptions
                position:
                  x: 1400
                  y: 100
                children:
                  - id: check-list-size
                    type: CONDITION
                    settings:
                      conditions:
                        - id: valid_size
                          name: Min 2 options
                          left: '{voteOptions.length}'
                          op: '>='
                          right: '2'
                    position:
                      x: 1760
                      y: 100
                    branches:
                      valid_size:
                        - id: confirm-msg
                          type: SAY
                          settings:
                            message: '📋 Przygotowano głosowanie na: {voteOptions.join('', '')}. Wpisz ''start'' aby rozpocząć lub ''cancel'' aby anulować.'
                          position:
                            x: 2140
                            y: 100
                          children:
                            - id: wait-confirm
                              type: WAIT_FOR_USER_REPLY
                              settings:
                                target: '@{sender}'
                                keyword: start,cancel
                                duration: '30'
                                resultVar: repl
                              position:
                                x: 2500
                                y: 100
                              errorChildren:
                                - id: handle-timeout
                                  type: HANDLE_ERROR
                                  settings:
                                    cases:
                                      - id: case-timeout
                                        errorName: WAIT_TIMEOUT
                                  position:
                                    x: 2880
                                    y: 400
                                  branches:
                                    case-timeout:
                                      - id: f730caf7-1c73-43d2-961e-0972886c377f
                                        type: JUMP
                                        settings:
                                          targetId: start-vote-msg
                                        children: []
                                  children: []
                              children:
                                - id: check-decision
                                  type: CONDITION
                                  settings:
                                    conditions:
                                      - id: is_start
                                        name: Start
                                        left: '{repl}'
                                        op: contains
                                        right: start
                                  position:
                                    x: 2880
                                    y: 100
                                  branches:
                                    is_start:
                                      - id: start-vote-msg
                                        type: SAY
                                        settings:
                                          message: '🗳️ Głosowanie rozpoczęte! Wpisz jedną z opcji: {voteOptions.join('', '')} (Czas: 60s)'
                                        position:
                                          x: 3260
                                          y: 100
                                        children:
                                          - id: voting-process
                                            type: WAIT_FOR_KEYWORD
                                            settings:
                                              keyword: ''
                                              duration: '60'
                                              enableVoting: true
                                              validOptions: '{voteOptions}'
                                              voteResultVar: results
                                              winnerVar: winner
                                            position:
                                              x: 3620
                                              y: 100
                                            errorChildren:
                                              - id: no-votes
                                                type: SAY
                                                settings:
                                                  message: ❌ Nikt nie zagłosował.
                                                position:
                                                  x: 4000
                                                  y: 380
                                                children: []
                                            children:
                                              - id: result-msg
                                                type: SAY
                                                settings:
                                                  message: '🏆 Głosowanie zakończone! Wyniki: {results.join('', '')}. Zwycięzca: {winner}!'
                                                position:
                                                  x: 4000
                                                  y: 100
                                                children: []
                                    ELSE:
                                      - id: cancel-confirmed
                                        type: SAY
                                        settings:
                                          message: 🛑 Głosowanie anulowane przez użytkownika.
                                        position:
                                          x: 3280
                                          y: 360
                                        children: []
                                  children: []
                      ELSE:
                        - id: not-enough-options
                          type: SAY
                          settings:
                            message: '⚠️ Błąd! Otrzymano {voteOptions.length} opcji (Input: "{args.all}"). Podaj co najmniej dwie opcje po przecinku! Np. !createvote Pizza, Burger'
                          position:
                            x: 2140
                            y: 360
                          children: []
                    children: []
            ELSE:
              - id: no-options
                type: SAY
                settings:
                  message: ⚠️ Podaj opcje głosowania oddzielone przecinkiem! Np. !createvote Pizza, Burger
                position:
                  x: 1400
                  y: 460
                children: []
zones: []
`;
