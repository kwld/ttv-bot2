
export const CMD_GIVE_POINTS_YAML = `
id: core-givepoints
name: Przelew (Give)
category: Economy
version: '1.0'
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
    optional: false
  - name: Amount
    type: number
    optional: false
globalCooldown: 2
userCooldown: 5
isBuiltIn: true
usageHint: "!givepoints @user [ilość]"
rootAction:
  id: root-give
  type: START
  settings:
    triggers: "!givepoints, !give, !przelew"
    onlyOnline: true
  position:
    x: 50
    y: 50
  children:
    - id: check-order-give
      type: VALIDATE_NUMBER
      settings:
        value: '{args.0}'
        resultVar: _temp_check
        allowedTypes: []
      position:
        x: 450
        y: 50
      children:
        - id: give-order-error
          type: SAY
          settings:
            message: '⚠️ Zła kolejność! Poprawny format to: !give @user kwota'
          position:
            x: 450
            y: 300
          children: []
      errorChildren:
        - id: give-validate-amount
          type: VALIDATE_NUMBER
          settings:
            value: '{args.1}'
            contextUser: '@{sender}'
            resultVar: amountToGive
            allowedTypes:
              - k
              - kk
              - all
              - '%'
          position:
            x: 850
            y: 50
          errorChildren:
            - id: give-err-num
              type: SAY
              settings:
                message: '⚠️ Podaj poprawną kwotę (np. 100, 50%, all). Użycie: !give @user 100'
              position:
                x: 850
                y: 300
              children: []
          children:
            - id: give-check-funds
              type: POINTS_GET
              settings:
                target: '@{sender}'
                resultVar: senderBalance
              position:
                x: 1250
                y: 50
              children:
                - id: give-cond-funds
                  type: CONDITION
                  settings:
                    conditions:
                      - id: has_enough
                        name: Has Enough
                        left: '{senderBalance}'
                        op: '>='
                        right: '{amountToGive}'
                  position:
                    x: 1650
                    y: 50
                  children: []
                  branches:
                    has_enough:
                      - id: give-check-target
                        type: POINTS_GET
                        settings:
                          target: '@{args.0}'
                          resultVar: targetBalance
                          userVar: targetUser
                        position:
                          x: 2050
                          y: 50
                        errorChildren:
                          - id: give-err-target
                            type: SAY
                            settings:
                              message: ❌ Nie znaleziono użytkownika {args.0}.
                            position:
                              x: 2050
                              y: 300
                            children: []
                        children:
                          - id: give-cond-self
                            type: CONDITION
                            settings:
                              conditions:
                                - id: not_self
                                  name: Not Self
                                  left: '{targetUser.id}'
                                  op: '!='
                                  right: '{sender.id}'
                            position:
                              x: 2450
                              y: 50
                            children: []
                            branches:
                              not_self:
                                - id: give-remove-sender
                                  type: POINTS_MODIFY
                                  settings:
                                    target: '@{sender}'
                                    amount: '{amountToGive}'
                                    operation: remove
                                  position:
                                    x: 2850
                                    y: 50
                                  children:
                                    - id: give-add-target
                                      type: POINTS_MODIFY
                                      settings:
                                        target: '@{targetUser}'
                                        amount: '{amountToGive}'
                                        operation: add
                                        userVar: targetUser
                                      position:
                                        x: 3250
                                        y: 50
                                      children:
                                        - id: give-success
                                          type: SAY
                                          settings:
                                            message: '🤝 @{sender.displayName} przekazał {amountToGive} {channel.currencySymbol} dla @{targetUser.displayName}!'
                                          position:
                                            x: 3650
                                            y: 50
                                          children: []
                              ELSE:
                                - id: give-err-self
                                  type: SAY
                                  settings:
                                    message: 🤔 Przelew do samego siebie? To tak nie działa.
                                  position:
                                    x: 2450
                                    y: 300
                                  children: []
                    ELSE:
                      - id: give-err-poor
                        type: SAY
                        settings:
                          message: '💸 @{sender.displayName}, nie masz tyle punktów! Masz {senderBalance}, chcesz dać {amountToGive}.'
                        position:
                          x: 1650
                          y: 300
                        children: []
zones: []
`;