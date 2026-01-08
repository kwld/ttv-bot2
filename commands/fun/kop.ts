
export const CMD_KOP_YAML = `
id: fun-kop
name: Kopnij (Kop)
category: Fun
version: '1.0'
provider: twitch
channelId: sim_1
enabled: false
testAsUser: false
allowedRanks:
  - regular
staticVariables: {}
args:
  - name: Cel (Opcjonalny)
    type: user
    optional: true
globalCooldown: 5
userCooldown: 10
isBuiltIn: true
usageHint: "!kop [@user] lub !kop (losowo)"
rootAction:
  id: root-kop
  type: START
  settings:
    triggers: "!kop, !kick, !zasadz"
  position:
    x: 50
    y: 100
  children:
    - id: check-has-arg
      type: CONDITION
      settings:
        conditions:
          - id: has_target
            name: Podano Cel
            left: '{args.length}'
            op: '>'
            right: '0'
      position:
        x: 450
        y: 100
      children: []
      branches:
        has_target:
          - id: validate-user
            type: CHECK_USER
            settings:
              query: '{args.0}'
              resultVar: victim
            position:
              x: 850
              y: 50
            errorChildren:
              - id: missed-kick
                type: SAY
                settings:
                  message: 💨 @{sender.displayName} bierze zamach i... kopie powietrze xdd (Nie znaleziono takiego użytkownika)
                position:
                  x: 1250
                  y: 250
                children: []
            children:
              - id: kick-specific
                type: SAY
                settings:
                  message: 🥾 @{sender.displayName} zasadził soczystego kopa w tyłek użytkownika @{victim.displayName}! Ała!
                position:
                  x: 1250
                  y: 50
                children: []
        ELSE:
          - id: pick-random
            type: RANDOM_CHATTER
            settings:
              resultVar: victim
              allowedRanks: []
            position:
              x: 850
              y: 450
            errorChildren:
              - id: no-one-to-kick
                type: SAY
                settings:
                  message: 👀 Nikogo nie ma w pobliżu... @{sender.displayName} potyka się o własne nogi.
                position:
                  x: 1250
                  y: 650
                children: []
            children:
              - id: kick-random
                type: SAY
                settings:
                  message: 🎲 @{sender.displayName} rozgląda się i z nienacka kopie @{victim.displayName}! Co za agresja!
                position:
                  x: 1250
                  y: 450
                children: []
zones: []
`;
