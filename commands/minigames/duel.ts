
export const CMD_DUEL_YAML = `
id: core-duel
name: Pojedynek (Duel)
category: Minigames
version: '1.0'
provider: twitch
channelId: sim_1
enabled: false
testAsUser: false
allowedRanks:
  - regular
staticVariables:
  win_chance: '50'
  accept_keyword: akceptuje
  default_points: '5000'
  reject_keyword: odrzucam
args:
  - name: Target User
    type: user
    optional: false
  - name: Amount
    type: number
    optional: true
isBuiltIn: true
usageHint: "!duel @user [stawka] lub !duel"
zones:
  - id: zone-entry
    label: Setup & Args Check
    x: 40
    y: 120
    width: 1160
    height: 1040
    color: slate
  - id: zone-validation
    label: Validation Chain
    x: 1320
    y: 380
    width: 4280
    height: 800
    color: purple
  - id: zone-execution
    label: Execution Phase
    x: 5780
    y: 80
    width: 1620
    height: 1400
    color: red
rootAction:
  id: root-duel
  type: START
  settings:
    triggers: "!duel, !pojedynek"
    onlyOnline: true
  position:
    x: 50
    y: 150
  detachedChildren: []
  children:
    - id: duel-mode-check
      type: CONDITION
      settings:
        conditions:
          - id: is_raffle_mode
            name: Battle Royale (No Args)
            left: '{args.length}'
            op: ==
            right: '0'
      position:
        x: 450
        y: 150
      children: []
      branches:
        is_raffle_mode:
          - id: e9b6c99c-55c4-4189-bd0d-73ae5786569a
            type: SAY
            settings:
              message: '@{sender} musisz podać kogo wyzywasz i opcjonalnie wartość (domyślnie jest {static.default_points})'
            children: []
            position:
              x: 860
              y: 140
        ELSE:
          - id: init-default-wager
            type: SET_VARIABLE
            settings:
              name: wager
              value: '{static.default_points}'
            position:
              x: 450
              y: 500
            children:
              - id: check-custom-wager
                type: CONDITION
                settings:
                  conditions:
                    - id: has_amount
                      name: Has Custom Amount
                      left: '{args.length}'
                      op: '>='
                      right: '2'
                position:
                  x: 850
                  y: 500
                children: []
                branches:
                  has_amount:
                    - id: set-custom-wager
                      type: SET_VARIABLE
                      settings:
                        name: wager
                        value: '{args.1}'
                      position:
                        x: 860
                        y: 840
                      children:
                        - id: duel-validate-bet
                          type: VALIDATE_NUMBER
                          settings:
                            value: '{wager}'
                            contextUser: '@{sender}'
                            resultVar: finalWager
                            customError: BAD_BET
                            allowedTypes:
                              - k
                              - kk
                              - '%'
                              - all
                          position:
                            x: 1350
                            y: 400
                          errorChildren:
                            - id: duel-err-bet
                              type: SAY
                              settings:
                                message: '⚠️ Błąd stawki: "{wager}". Użyj: 100, 10k, 50% lub all.'
                              position:
                                x: 1750
                                y: 800
                              children: []
                          children:
                            - id: duel-check-sender-points
                              type: POINTS_GET
                              settings:
                                target: '@{sender}'
                                resultVar: senderPoints
                              position:
                                x: 1750
                                y: 400
                              children:
                                - id: duel-cond-sender-funds
                                  type: CONDITION
                                  settings:
                                    conditions:
                                      - id: has_funds
                                        name: Sender Has Funds
                                        left: '{senderPoints}'
                                        op: '>='
                                        right: '{finalWager}'
                                  position:
                                    x: 2150
                                    y: 400
                                  children: []
                                  branches:
                                    has_funds:
                                      - id: duel-get-target
                                        type: POINTS_GET
                                        settings:
                                          target: '{args.0}'
                                          resultVar: targetPoints
                                        position:
                                          x: 2550
                                          y: 400
                                        errorChildren:
                                          - id: duel-err-target-404
                                            type: SAY
                                            settings:
                                              message: ❌ Nie znaleziono użytkownika {args.0}!
                                            position:
                                              x: 2950
                                              y: 800
                                            children: []
                                        children:
                                          - id: duel-cond-self
                                            type: CONDITION
                                            settings:
                                              conditions:
                                                - id: not_self
                                                  name: Not Self
                                                  left: '{targetUser.id}'
                                                  op: '!='
                                                  right: '{sender.id}'
                                            position:
                                              x: 2950
                                              y: 400
                                            children: []
                                            branches:
                                              not_self:
                                                - id: duel-cond-target-funds
                                                  type: CONDITION
                                                  settings:
                                                    conditions:
                                                      - id: target_has_funds
                                                        name: Target Has Funds
                                                        left: '{targetPoints}'
                                                        op: '>='
                                                        right: '{finalWager}'
                                                  position:
                                                    x: 3350
                                                    y: 400
                                                  children: []
                                                  branches:
                                                    target_has_funds:
                                                      - id: duel-invite
                                                        type: SAY
                                                        settings:
                                                          message: '⚔️ @{targetUser.displayName}, @{sender.displayName} wyzywa Cię na pojedynek o {finalWager} {channel.currencySymbol}! Napisz "{static.accept_keyword}" lub "{static.reject_keyword}"!'
                                                        position:
                                                          x: 3750
                                                          y: 400
                                                        children:
                                                          - id: duel-wait-reply
                                                            type: WAIT_FOR_USER_REPLY
                                                            settings:
                                                              target: '@{targetUser}'
                                                              keyword: '{static.accept_keyword},{static.reject_keyword}'
                                                              duration: '30'
                                                            position:
                                                              x: 4150
                                                              y: 400
                                                            errorChildren:
                                                              - id: duel-timeout
                                                                type: SAY
                                                                settings:
                                                                  message: 💤 @{targetUser.displayName} stchórzył!
                                                                position:
                                                                  x: 4560
                                                                  y: 840
                                                                children: []
                                                            children:
                                                              - id: duel-cond-accepted
                                                                type: CONDITION
                                                                settings:
                                                                  conditions:
                                                                    - id: accepted
                                                                      name: Accepted
                                                                      left: '{replied_word}'
                                                                      op: contains
                                                                      right: '{static.accept_keyword}'
                                                                position:
                                                                  x: 4850
                                                                  y: 400
                                                                children: []
                                                                branches:
                                                                  accepted:
                                                                    - id: duel-roll
                                                                      type: RANDOM_NUMBER
                                                                      settings:
                                                                        min: '1'
                                                                        max: '100'
                                                                        resultVar: roll
                                                                      position:
                                                                        x: 5800
                                                                        y: 400
                                                                      children:
                                                                        - id: duel-cond-win
                                                                          type: CONDITION
                                                                          settings:
                                                                            conditions:
                                                                              - id: sender_wins
                                                                                name: Sender Wins
                                                                                left: '{roll}'
                                                                                op: '>'
                                                                                right: '{static.win_chance}'
                                                                          position:
                                                                            x: 6200
                                                                            y: 400
                                                                          children: []
                                                                          branches:
                                                                            sender_wins:
                                                                              - id: win-add
                                                                                type: POINTS_MODIFY
                                                                                settings:
                                                                                  target: '@{sender}'
                                                                                  amount: '{finalWager}'
                                                                                  operation: add
                                                                                position:
                                                                                  x: 7020
                                                                                  y: 100
                                                                                children:
                                                                                  - id: win-sub
                                                                                    type: POINTS_MODIFY
                                                                                    settings:
                                                                                      target: '@{targetUser}'
                                                                                      amount: '{finalWager}'
                                                                                      operation: remove
                                                                                    position:
                                                                                      x: 7020
                                                                                      y: 580
                                                                                    children:
                                                                                      - id: win-msg
                                                                                        type: SAY
                                                                                        settings:
                                                                                          message: '🏆 WYNIK: {roll}. @{sender.displayName} WYGRYWA i zabiera {finalWager} {channel.currencySymbol}!'
                                                                                        position:
                                                                                          x: 7020
                                                                                          y: 1060
                                                                                        children: []
                                                                            ELSE:
                                                                              - id: lose-sub
                                                                                type: POINTS_MODIFY
                                                                                settings:
                                                                                  target: '@{sender}'
                                                                                  amount: '{finalWager}'
                                                                                  operation: remove
                                                                                position:
                                                                                  x: 5820
                                                                                  y: 980
                                                                                children:
                                                                                  - id: lose-add
                                                                                    type: POINTS_MODIFY
                                                                                    settings:
                                                                                      target: '@{targetUser}'
                                                                                      amount: '{finalWager}'
                                                                                      operation: add
                                                                                    position:
                                                                                      x: 6240
                                                                                      y: 980
                                                                                    children:
                                                                                      - id: lose-msg
                                                                                        type: SAY
                                                                                        settings:
                                                                                          message: '🛡️ WYNIK: {roll}. @{targetUser.displayName} WYGRYWA i zgarnia {finalWager} {channel.currencySymbol}!'
                                                                                        position:
                                                                                          x: 6620
                                                                                          y: 980
                                                                                        children: []
                                                                                waypoints:
                                                                                  - x: 6500
                                                                                    y: 830
                                                                                  - x: 5840
                                                                                    y: 850
                                                                  ELSE:
                                                                    - id: duel-rejected
                                                                      type: SAY
                                                                      settings:
                                                                        message: 🏳️ Pojedynek odrzucony.
                                                                      position:
                                                                        x: 5220
                                                                        y: 820
                                                                      children: []
                                                    ELSE:
                                                      - id: duel-err-target-broke
                                                        type: SAY
                                                        settings:
                                                          message: '💸 @{targetUser.displayName} jest zbyt spłukany na ten pojedynek (ma {targetPoints}, potrzeba {finalWager})!'
                                                        position:
                                                          x: 3750
                                                          y: 800
                                                        children: []
                                              ELSE:
                                                - id: duel-err-self
                                                  type: SAY
                                                  settings:
                                                    message: 🤡 Nie możesz walczyć sam ze sobą!
                                                  position:
                                                    x: 3350
                                                    y: 800
                                                  children: []
                                    ELSE:
                                      - id: duel-err-sender-broke
                                        type: SAY
                                        settings:
                                          message: '🚫 Nie masz wystarczająco punktów ({senderPoints}) na ten pojedynek (wymagane {finalWager})!'
                                        position:
                                          x: 2550
                                          y: 800
                                        children: []
                  ELSE:
                    - id: 149aa2fc-d8c5-4269-929a-b4ade3f9d502
                      type: JUMP
                      settings:
                        targetId: duel-validate-bet
                      children: []
                      position:
                        x: 1150
                        y: 500
`;