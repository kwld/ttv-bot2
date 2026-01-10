
export const CMD_SET_POINTS_YAML = `
id: core-setpoints
name: 'Admin: Ustaw Punkty'
category: Economy
version: '1.0'
provider: twitch
channelId: sim_1
enabled: false
testAsUser: false
allowedRanks:
  - moderator
  - broadcaster
staticVariables: {}
args:
  - name: User
    type: user
    optional: false
  - name: Amount
    type: number
    optional: false
globalCooldown: 0
userCooldown: 0
isBuiltIn: true
usageHint: "!setpoints @user [ilość]"
rootAction:
  id: root-setpoints
  type: START
  settings:
    triggers: "!setpoints, !set"
    onlyOnline: true
  position:
    x: 50
    y: 50
  children:
    - id: set-rank-check
      type: RANK_CHECK
      settings:
        requiredRanks:
          - Moderator
          - Broadcaster
      position:
        x: 450
        y: 50
      errorChildren:
        - id: set-perm-error
          type: SAY
          settings:
            message: ⛔ Brak uprawnień.
          position:
            x: 450
            y: 250
          children: []
      children:
        - id: check-order-set
          type: VALIDATE_NUMBER
          settings:
            value: '{args.0}'
            resultVar: _temp_check
            allowedTypes: []
          position:
            x: 850
            y: 50
          children:
            - id: set-order-error
              type: SAY
              settings:
                message: '⚠️ Zła kolejność! Poprawny format to: !setpoints @user kwota'
              position:
                x: 850
                y: 300
              children: []
          errorChildren:
            - id: set-validate
              type: VALIDATE_NUMBER
              settings:
                value: '{args.1}'
                resultVar: amountToSet
                allowedTypes:
                  - k
                  - kk
              position:
                x: 1250
                y: 50
              errorChildren:
                - id: set-num-error
                  type: SAY
                  settings:
                    message: '⚠️ Błędna wartość. Użycie: !setpoints @user 5000'
                  position:
                    x: 1250
                    y: 300
                  children: []
              children:
                - id: set-modify
                  type: POINTS_MODIFY
                  settings:
                    target: '@{args.0}'
                    amount: '{amountToSet}'
                    operation: set
                    resultVar: newBalance
                    userVar: targetUser
                  position:
                    x: 1650
                    y: 50
                  errorChildren:
                    - id: set-user-error
                      type: SAY
                      settings:
                        message: ❌ Nie znaleziono użytkownika {args.0}.
                      position:
                        x: 1650
                        y: 300
                      children: []
                  children:
                    - id: set-success
                      type: SAY
                      settings:
                        message: '✏️ Ustawiono {amountToSet} {channel.currencySymbol} dla @{targetUser.displayName}.'
                      position:
                        x: 2050
                        y: 50
                      children: []
zones: []
`;