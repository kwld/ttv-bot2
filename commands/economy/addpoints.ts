
export const CMD_ADD_POINTS_YAML = `
id: core-addpoints
name: 'Admin: Dodaj Punkty'
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
usageHint: "!addpoints @user [ilość]"
rootAction:
  id: root-addpoints
  type: START
  settings:
    triggers: "!addpoints, !add"
  position:
    x: 50
    y: 50
  children:
    - id: add-rank-check
      type: RANK_CHECK
      settings:
        requiredRanks:
          - Moderator
          - Broadcaster
      position:
        x: 450
        y: 50
      errorChildren:
        - id: add-perm-error
          type: SAY
          settings:
            message: '⛔ @{sender.displayName}, nie masz uprawnień do tej komendy.'
          position:
            x: 450
            y: 250
          children: []
      children:
        - id: check-order-add
          type: VALIDATE_NUMBER
          settings:
            value: '{args.0}'
            resultVar: _temp_check
            allowedTypes: []
          position:
            x: 850
            y: 50
          children:
            - id: add-order-error
              type: SAY
              settings:
                message: '⚠️ Zła kolejność! Poprawny format to: !addpoints @user kwota'
              position:
                x: 850
                y: 300
              children: []
          errorChildren:
            - id: add-validate
              type: VALIDATE_NUMBER
              settings:
                value: '{args.1}'
                resultVar: amountToAdd
                allowedTypes:
                  - k
                  - kk
              position:
                x: 1250
                y: 50
              errorChildren:
                - id: add-num-error
                  type: SAY
                  settings:
                    message: '⚠️ Podaj poprawną kwotę. Użycie: !addpoints @user 100'
                  position:
                    x: 1250
                    y: 300
                  children: []
              children:
                - id: add-modify
                  type: POINTS_MODIFY
                  settings:
                    target: '@{args.0}'
                    amount: '{amountToAdd}'
                    operation: add
                    resultVar: newBalance
                    userVar: targetUser
                  position:
                    x: 1650
                    y: 50
                  errorChildren:
                    - id: add-user-error
                      type: SAY
                      settings:
                        message: ❌ Nie znaleziono użytkownika {args.0}.
                      position:
                        x: 1650
                        y: 300
                      children: []
                  children:
                    - id: add-success
                      type: SAY
                      settings:
                        message: '✅ Dodano {amountToAdd} {channel.currencySymbol} dla @{targetUser.displayName}. Nowy stan: {newBalance}.'
                      position:
                        x: 2050
                        y: 50
                      children: []
zones: []
`;
