
export const CMD_CLIP_YAML = `
id: core-clip
name: Klip (Clip)
category: Stream
version: '2.0'
provider: twitch
channelId: sim_1
enabled: false
testAsUser: false
allowedRanks:
  - regular
staticVariables: {}
args:
  - name: Title/Time
    type: text
    optional: true
  - name: Time
    type: number
    optional: true
globalCooldown: 30
userCooldown: 60
isBuiltIn: true
usageHint: "!clip [tytuł] [czas]"
zones:
  - id: parser-zone
    label: Inteligentny Parser
    x: 10
    y: -80
    width: 1540
    height: 860
    color: purple
  - id: exec-zone
    label: Execute
    x: 1600
    y: -60
    width: 1000
    height: 680
    color: red
rootAction:
  id: root-clip
  type: START
  settings:
    triggers: "!klip, !clip"
    onlyOnline: true
  position:
    x: 40
    y: 200
  detachedChildren:
    - id: create-clip-final
      type: CREATE_CLIP
      settings:
        createDelay: '{clip_duration}'
        title: '{clip_title}'
        resultVar: clipUrl
      position:
        x: 1650
        y: -10
      errorChildren:
        - id: clip-failed
          type: SAY
          settings:
            message: ❌ Błąd tworzenia klipa. Upewnij się, że stream jest online.
          position:
            x: 2060
            y: 300
          children: []
      children:
        - id: clip-success
          type: SAY
          settings:
            message: '🎬 Klip utworzony ({clip_duration}s): {clipUrl}'
          position:
            x: 2060
            y: -20
          children: []
  children:
    - id: check-last-arg
      type: VALIDATE_NUMBER
      settings:
        value: '{args.last}'
        resultVar: parsed_last_arg
        allowedTypes: []
      position:
        x: 420
        y: 200
      children:
        - id: set-with-time
          type: SET_VARIABLE
          settings:
            name: clip_duration
            value: '{parsed_last_arg}'
          position:
            x: 820
            y: -40
          children:
            - id: set-title-remaining
              type: SET_VARIABLE
              settings:
                name: clip_title
                value: '{args.0-last-1}'
              position:
                x: 1160
                y: -40
              children:
                - id: jump-1
                  type: JUMP
                  settings:
                    targetId: create-clip-final
                  children: []
                  position:
                    x: 1150
                    y: 250
      errorChildren:
        - id: set-default-time
          type: SET_VARIABLE
          settings:
            name: clip_duration
            value: '30'
          position:
            x: 800
            y: 380
          children:
            - id: set-title-all
              type: SET_VARIABLE
              settings:
                name: clip_title
                value: '{args.0-last}'
              position:
                x: 1160
                y: 380
              children:
                - id: jump-2
                  type: JUMP
                  settings:
                    targetId: create-clip-final
                  children: []
                  position:
                    x: 1150
                    y: 550
`;