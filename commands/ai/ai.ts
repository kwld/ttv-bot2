
export const CMD_AI_YAML = `
id: core-ai
name: AI Chat (Gemini)
category: AI & Utility
version: '1.1'
provider: twitch
channelId: sim_1
enabled: false
testAsUser: false
allowedRanks:
  - regular
staticVariables: {}
args:
  - name: Pytanie
    type: text
    optional: false
globalCooldown: 5
userCooldown: 10
isBuiltIn: true
usageHint: "!ai [pytanie]"
rootAction:
  id: root-ai
  type: START
  settings:
    triggers: "!ai, !pytanie, !bot"
    onlyOnline: true
  position:
    x: 80
    y: 60
  children:
    - id: ai-node
      type: AI_CHAT
      settings:
        prompt: 'Użytkownik @{sender.displayName} pyta: {args}'
        systemInstruction: Jesteś pomocnym i charyzmatycznym botem na czacie Twitch. Twoje odpowiedzi są krótkie (max 2 zdania), trafne i czasem zabawne. Używasz emotek Twitcha (np. Kappa, LUL, PogChamp) tam gdzie to pasuje. Zawsze odpowiadasz w języku polskim.
        resultVar: ai_response
        model: Gemini Flash
        useMemory: true
        includeContext: true
        includeThumbnail: true
        includeSenderContext: true
        includeUserContext: true
        memoryId: default
      position:
        x: 460
        y: 60
      children:
        - id: ai-say
          type: SAY
          settings:
            message: '{ai_response}'
          position:
            x: 840
            y: 60
          children: []
      errorChildren:
        - id: 493ea86b-2e07-4cde-a04f-d855985c6e06
          type: LOG
          settings:
            message: '{error_name}'
            level: error
          children: []
          position:
            x: 840
            y: 360
          waypoints: []
  detachedChildren: []
zones: []
`;