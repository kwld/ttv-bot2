
export const CMD_GAMBLE_YAML = `
id: core-gamble
name: Gamble (Kasyno)
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
staticVariableDefinitions:
  win_chance:
    key: win_chance
    type: slider
    label: Szansa na wygraną (%)
    min: 1
    max: 99
    step: 1
args:
  - name: Stawka
    type: number
    optional: false
globalCooldown: 0
userCooldown: 5
isBuiltIn: true
usageHint: "!gamble [kwota] lub !gamble all"
zones:
  - id: zone-gamble-validation
    label: Walidacja Stawki
    x: 40
    y: 120
    width: 1200
    height: 500
    color: slate
  - id: zone-gamble-logic
    label: Losowanie i Wynik
    x: 1280
    y: 120
    width: 1600
    height: 800
    color: purple
rootAction:
  id: root-gamble
  type: START
  settings:
    triggers: "!gamble, !ruletka, !bet"
  position:
    x: 50
    y: 200
  children:
    - id: gamble-validate
      type: VALIDATE_NUMBER
      settings:
        value: '{args.0}'
        contextUser: '@{sender}'
        resultVar: wager
        customError: INVALID_WAGER
        allowedTypes:
          - k
          - kk
          - '%'
          - all
      position:
        x: 450
        y: 200
      errorChildren:
        - id: gamble-error-wager
          type: SAY
          settings:
            message: ⚠️ Podaj poprawną stawkę! Np. !gamble 100 lub !gamble all
          position:
            x: 450
            y: 450
          children: []
      children:
        - id: gamble-check-funds
          type: POINTS_GET
          settings:
            target: '@{sender}'
            resultVar: currentPoints
          position:
            x: 850
            y: 200
          children:
            - id: gamble-cond-funds
              type: CONDITION
              settings:
                conditions:
                  - id: has_enough
                    name: Stać go
                    left: '{currentPoints}'
                    op: '>='
                    right: '{wager}'
              position:
                x: 1350
                y: 200
              children: []
              branches:
                has_enough:
                  - id: gamble-roll
                    type: RANDOM_NUMBER
                    settings:
                      min: '1'
                      max: '100'
                      resultVar: roll
                    position:
                      x: 1750
                      y: 200
                    children:
                      - id: gamble-cond-win
                        type: CONDITION
                        settings:
                          conditions:
                            - id: is_win
                              name: Wygrana
                              left: '{roll}'
                              op: '<='
                              right: '{static.win_chance}'
                        position:
                          x: 2150
                          y: 200
                        children: []
                        branches:
                          is_win:
                            - id: gamble-win-add
                              type: POINTS_MODIFY
                              settings:
                                target: '@{sender}'
                                amount: '{wager}'
                                operation: add
                                resultVar: newBalance
                              position:
                                x: 2550
                                y: 50
                              children:
                                - id: gamble-win-msg
                                  type: SAY
                                  settings:
                                    message: '🎰 {roll} | WYGRANA! @{sender.displayName} zgarnia {wager} {channel.currencySymbol}! (Stan: {newBalance})'
                                  position:
                                    x: 2950
                                    y: 50
                                  children: []
                          ELSE:
                            - id: gamble-lose-sub
                              type: POINTS_MODIFY
                              settings:
                                target: '@{sender}'
                                amount: '{wager}'
                                operation: remove
                                resultVar: newBalance
                              position:
                                x: 2550
                                y: 450
                              children:
                                - id: gamble-lose-msg
                                  type: SAY
                                  settings:
                                    message: '📉 {roll} | Przegrana... @{sender.displayName} traci {wager} {channel.currencySymbol}. (Stan: {newBalance})'
                                  position:
                                    x: 2950
                                    y: 450
                                  children: []
                ELSE:
                  - id: gamble-poor-msg
                    type: SAY
                    settings:
                      message: '💸 Nie masz wystarczająco punktów! Posiadasz: {currentPoints}, chcesz postawić: {wager}.'
                    position:
                      x: 1350
                      y: 450
                    children: []
`;
