
export const CMD_RAFFLE_YAML = `
id: core-raffle
name: Konkurs (Raffle)
category: Minigames
version: '1.1'
provider: twitch
channelId: sim_1
enabled: false
testAsUser: false
allowedRanks:
  - moderator
  - broadcaster
staticVariables:
  default_keyword: gram
  reward_amount: '5000'
  default_time: '30'
args:
  - name: Prize Amount
    type: number
    optional: true
  - name: Duration (s)
    type: number
    optional: true
isBuiltIn: true
usageHint: "!raffle [kwota] [czas]"
zones:
  - id: z-setup
    label: 1. Setup & Walidacja
    x: -100
    y: 420
    width: 1840
    height: 1200
    color: slate
  - id: z-run
    label: 2. Realizacja Konkursu
    x: 1780
    y: 1000
    width: 2000
    height: 1220
    color: amber
rootAction:
  id: root-raffle
  type: START
  settings:
    triggers: "!raffle, !losowanie"
    defaultDelay: '0.6'
  position:
    x: -80
    y: 460
  children:
    - id: init-defaults
      type: SET_VARIABLE
      settings:
        name: reward
        value: '{static.reward_amount}'
      position:
        x: 280
        y: 460
      children:
        - id: init-time
          type: SET_VARIABLE
          settings:
            name: duration
            value: '{static.default_time}'
          position:
            x: 640
            y: 460
          children:
            - id: eae81155-2f65-41b8-96b1-65ffe9321b9e
              type: RANK_CHECK
              settings:
                requiredRanks:
                  - Broadcaster
                  - Moderator
              position:
                x: 1000
                y: 460
              errorChildren:
                - id: 780224df-a024-4e34-87d8-5b286adc37d6
                  type: SAY
                  settings:
                    message: ⛔ @{sender.displayName} nie masz uprawnień do !raffle.
                  children: []
                  position:
                    x: 1380
                    y: 460
              children:
                - id: check-args-exist
                  type: CONDITION
                  settings:
                    conditions:
                      - id: case_has_args
                        name: Podano Kwotę
                        left: '{args.length}'
                        op: '>'
                        right: '0'
                  position:
                    x: 180
                    y: 880
                  children: []
                  branches:
                    case_has_args:
                      - id: validate-custom-reward
                        type: VALIDATE_NUMBER
                        settings:
                          value: '{args.0}'
                          customError: INVALID_RAFFLE_AMOUNT
                          resultVar: parsedReward
                          allowedTypes:
                            - k
                            - kk
                        position:
                          x: 620
                          y: 900
                        errorChildren:
                          - id: raffle-err-msg
                            type: SAY
                            settings:
                              message: '⚠️ Błędna kwota! Podaj liczbę lub zostaw puste (domyślnie: {static.reward_amount}).'
                            position:
                              x: 1000
                              y: 1300
                            children: []
                        children:
                          - id: set-custom-reward
                            type: SET_VARIABLE
                            settings:
                              name: reward
                              value: '{parsedReward}'
                            position:
                              x: 1020
                              y: 900
                            children:
                              - id: check-time-arg
                                type: CONDITION
                                settings:
                                  conditions:
                                    - id: has_time
                                      name: Has Time Arg
                                      left: '{args.length}'
                                      op: '>='
                                      right: '2'
                                position:
                                  x: 1360
                                  y: 900
                                branches:
                                  has_time:
                                    - id: set-custom-time
                                      type: SET_VARIABLE
                                      settings:
                                        name: duration
                                        value: '{args.1}'
                                      position:
                                        x: 1360
                                        y: 1280
                                      children:
                                        - id: jump-with-time
                                          type: JUMP
                                          settings:
                                            targetId: raffle-logic-start
                                          children: []
                                          position:
                                            x: 1800
                                            y: 1400
                                      waypoints:
                                        - x: 1700
                                          y: 1210
                                        - x: 1350
                                          y: 1210
                                  ELSE:
                                    - id: jump-to-main-execution
                                      type: JUMP
                                      settings:
                                        targetId: raffle-logic-start
                                      position:
                                        x: 1360
                                        y: 1200
                                      children: []
                                children: []
                    ELSE:
                      - id: raffle-logic-start
                        type: SAY
                        settings:
                          message: '🎟️ Konkurs o {reward} {channel.currencySymbol} wystartował (Czas: {duration}s)! Wpisz "{static.default_keyword}", aby dołączyć!'
                        position:
                          x: 1830
                          y: 1050
                        children:
                          - id: raffle-wait
                            type: WAIT_FOR_KEYWORD
                            settings:
                              keyword: '{static.default_keyword}'
                              duration: '{duration}'
                            position:
                              x: 2230
                              y: 1050
                            errorChildren:
                              - id: bbe4095b-f282-4da8-8582-774f80ac7dec
                                type: HANDLE_ERROR
                                settings:
                                  cases:
                                    - id: 35de5487-8aac-4947-966d-9ef38536fab2
                                      errorName: COLLECTION_EMPTY
                                    - id: 90f24278-ddfa-452e-85e2-2b7d2bb6b898
                                      errorName: ALREADY_WAITING
                                    - id: a1dc1fb8-5244-4f94-85fd-f4a90c6e92e9
                                      errorName: ANY
                                children: []
                                position:
                                  x: 2620
                                  y: 1380
                                branches:
                                  35de5487-8aac-4947-966d-9ef38536fab2:
                                    - id: raffle-empty-msg
                                      type: SAY
                                      settings:
                                        message: Nikt nie dołączył do losowania. Konkurs anulowany! ❌
                                      position:
                                        x: 3040
                                        y: 1600
                                      children: []
                                      waypoints: []
                                  90f24278-ddfa-452e-85e2-2b7d2bb6b898:
                                    - id: 882b1e0d-a160-4a11-9bef-8bd14a3dda94
                                      type: SAY
                                      settings:
                                        message: ⚠️ Konkurs już trwa! Zaczekaj na zakończenie obecnego losowania.
                                      children: []
                                      position:
                                        x: 3040
                                        y: 1900
                            children:
                              - id: raffle-pick
                                type: RANDOM_PICK
                                settings:
                                  source: '{participants}'
                                position:
                                  x: 2630
                                  y: 1050
                                children:
                                  - id: raffle-grant
                                    type: POINTS_MODIFY
                                    settings:
                                      target: '@{winner}'
                                      amount: '{reward}'
                                      operation: add
                                    position:
                                      x: 3030
                                      y: 1050
                                    children:
                                      - id: raffle-win-msg
                                        type: SAY
                                        settings:
                                          message: 🎉 Gratulacje @{winner.displayName}! Wygrałeś losowanie i zgarniasz {reward} {channel.currencySymbol}! 🎉
                                        position:
                                          x: 3430
                                          y: 1050
                                        children: []
  detachedChildren: []
`;
