
export const CMD_WHOIS_YAML = `
id: core-whois
name: Sprawdź Konto (WhoIs)
category: Utility
version: '1.2'
provider: twitch
channelId: sim_1
enabled: false
testAsUser: false
allowedRanks:
  - regular
staticVariables: {}
args:
  - name: Target User
    type: user
    optional: true
globalCooldown: 5
userCooldown: 10
isBuiltIn: true
usageHint: "!whois @nick lub !id"
rootAction:
  id: root-whois
  type: START
  settings:
    triggers: "!whois, !sprawdz, !user, !konto, !id"
    onlyOnline: true
  position:
    x: 50
    y: 100
  children:
    - id: check-has-arg
      type: CONDITION
      settings:
        conditions:
          - id: has_target
            name: Has Target Arg
            left: '{args.length}'
            op: '>'
            right: '0'
      position:
        x: 450
        y: 100
      children: []
      branches:
        has_target:
          - id: check-user-api
            type: CHECK_USER
            settings:
              query: '{args.0}'
              resultVar: apiUser
            position:
              x: 850
              y: 50
            children:
              - id: say-user-info
                type: SAY
                settings:
                  message: '👤 Użytkownik: @{apiUser.displayName} | ID: {apiUser.id} | 📅 Utworzono: {apiUser.createdAt} | 👀 Wyświetlenia: {apiUser.viewCount}'
                position:
                  x: 1250
                  y: 50
                children: []
            errorChildren:
              - id: msg-not-found
                type: SAY
                settings:
                  message: ❌ Nie znaleziono użytkownika "{args.0}" w bazie Twitch.
                position:
                  x: 1250
                  y: 300
                children: []
        ELSE:
          - id: say-self-info
            type: SAY
            settings:
              message: '👤 Twoje Konto: @{sender.displayName} | ID: {sender.id} | Punkty: {sender.points}'
            position:
              x: 850
              y: 450
            children: []
zones: []
`;