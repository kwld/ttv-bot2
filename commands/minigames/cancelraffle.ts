
export const CMD_CANCEL_RAFFLE_YAML = `
id: core-cancelraffle
name: Anuluj Konkurs
category: Minigames
version: '1.0'
provider: twitch
channelId: sim_1
enabled: false
testAsUser: false
allowedRanks:
  - moderator
  - broadcaster
staticVariables: {}
args: []
globalCooldown: 0
userCooldown: 0
isBuiltIn: true
usageHint: "!cancelraffle"
rootAction:
  id: root-cancel
  type: START
  settings:
    triggers: "!cancelraffle, !stopraffle"
    onlyOnline: true
  position:
    x: 50
    y: 50
  children:
    - id: cancel-rank-check
      type: RANK_CHECK
      settings:
        requiredRanks:
          - Moderator
          - Broadcaster
      position:
        x: 450
        y: 50
      children:
        - id: halt-raffle
          type: HALT
          settings:
            triggers: "!raffle, !losowanie"
          position:
            x: 850
            y: 50
          children:
            - id: cancel-msg
              type: SAY
              settings:
                message: 🛑 Konkurs został anulowany przez moderatora.
              position:
                x: 1250
                y: 50
              children: []
zones: []
`;