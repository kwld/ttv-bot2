
export const CMD_LIST_YAML = `
id: core-cmdlist
name: Lista Komend
category: Utility
version: '1.0'
provider: twitch
channelId: sim_1
enabled: false
testAsUser: false
allowedRanks:
  - regular
staticVariables: {}
args: []
globalCooldown: 5
userCooldown: 10
isBuiltIn: true
usageHint: "!commands"
rootAction:
  id: root-cmdlist
  type: START
  settings:
    triggers: "!commands, !komendy, !help, !pomoc"
    onlyOnline: true
  position:
    x: 50
    y: 100
  children:
    - id: say-list
      type: SAY
      settings:
        message: '📜 Dostępne komendy: {all_commands}'
      position:
        x: 450
        y: 100
      children: []
zones: []
`;