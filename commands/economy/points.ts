
export const CMD_POINTS_YAML = `
id: core-points
name: Stan Konta
category: Economy
version: '1.1'
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
usageHint: "!points @username"
zones: []
rootAction:
  id: root-points
  type: START
  settings:
    triggers: "!points, !kasa"
    onlyOnline: true
  position:
    x: 50
    y: 50
  children:
    - id: points-get-logic
      type: POINTS_GET
      settings:
        target: '{args.0}'
        resultVar: userPoints
        userVar: targetUser
      position:
        x: 450
        y: 50
      errorChildren:
        - id: points-error-msg
          type: SAY
          settings:
            message: Nie znaleziono takiego użytkownika w bazie danych! ❌
          position:
            x: 850
            y: 400
          children: []
      children:
        - id: say-points-result
          type: SAY
          settings:
            message: '@{targetUser.displayName} posiada {userPoints} {channel.currencySymbol}'
          position:
            x: 850
            y: 50
          children: []
`;