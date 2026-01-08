
export const CMD_TOP_YAML = `
id: core-top
name: Ranking (Top)
category: Economy
version: '2.2'
provider: twitch
channelId: sim_1
enabled: false
testAsUser: false
allowedRanks:
  - regular
staticVariables: {}
args:
  - name: Typ (points/online/messages)
    type: selection
    optional: true
globalCooldown: 10
userCooldown: 30
isBuiltIn: true
usageHint: "!top [points/online/messages]"
rootAction:
  id: root-top
  type: START
  settings:
    triggers: "!top, !ranking, !leaderboard"
  position:
    x: 50
    y: 50
  children:
    - id: set-sort-type
      type: SET_VARIABLE
      settings:
        name: sortType
        value: '{args.0}'
      position:
        x: 450
        y: 50
      children:
        - id: check-sort-arg
          type: CONDITION
          settings:
            conditions:
              - id: is_messages
                name: Messages
                left: '{sortType}'
                op: contains
                right: message
              - id: is_online
                name: Online
                left: '{sortType}'
                op: contains
                right: online
          position:
            x: 850
            y: 50
          branches:
            is_messages:
              - id: top-msgs
                type: TOP_USERS
                settings:
                  limit: '5'
                  sortBy: messages
                  resultVar: leaders
                position:
                  x: 1250
                  y: 50
                children:
                  - id: join-msgs
                    type: JOIN_STRING
                    settings:
                      list: '{leaders}'
                      pattern: '{index==0?🥇 :}{index==1?🥈 :}{index==2?🥉 :}{item.displayName} ({item.messageCount} msg)'
                      separator: ', '
                      resultVar: leadersString
                      iteratorName: item
                    position:
                      x: 1650
                      y: 50
                    children:
                      - id: say-top-msgs
                        type: SAY
                        settings:
                          message: '🗣️ Najwięksi Gaduły: {leadersString}'
                        position:
                          x: 2050
                          y: 50
                        children: []
            is_online:
              - id: top-online
                type: TOP_USERS
                settings:
                  limit: '5'
                  sortBy: online
                  resultVar: leaders
                position:
                  x: 1250
                  y: 450
                children:
                  - id: join-online
                    type: JOIN_STRING
                    settings:
                      list: '{leaders}'
                      pattern: '{index==0?🥇 :}{index==1?🥈 :}{index==2?🥉 :}{item.displayName} ({item.onlineMinutes}m)'
                      separator: ', '
                      resultVar: leadersString
                      iteratorName: item
                    position:
                      x: 1650
                      y: 450
                    children:
                      - id: say-top-online
                        type: SAY
                        settings:
                          message: '🕒 Najaktywniejsi (Online): {leadersString}'
                        position:
                          x: 2050
                          y: 450
                        children: []
            ELSE:
              - id: top-points
                type: TOP_USERS
                settings:
                  limit: '5'
                  sortBy: points
                  resultVar: leaders
                position:
                  x: 1250
                  y: 850
                children:
                  - id: join-points
                    type: JOIN_STRING
                    settings:
                      list: '{leaders}'
                      pattern: '{index==0?🥇 :}{index==1?🥈 :}{index==2?🥉 :}{item.displayName} ({item.points})'
                      separator: ', '
                      resultVar: leadersString
                      iteratorName: item
                    position:
                      x: 1650
                      y: 850
                    children:
                      - id: say-top-points
                        type: SAY
                        settings:
                          message: '🏆 Top {leaders.length} Punkty: {leadersString}'
                        position:
                          x: 2050
                          y: 850
                        children: []
          children: []
zones: []
`;
