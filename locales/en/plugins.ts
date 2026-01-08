
export const plugins = {
  plugins: {
    START: { name: "Start Flow", desc: "Entry point. Configure triggers here." },
    SAY: { name: "Say (Send)", desc: "Send public message to chat." },
    LOG: { name: "System Log", desc: "Local console log only." },
    AI_CHAT: { name: "AI Chat (Gemini)", desc: "Generate intelligent response." },
    EMAIL: { name: "Send Email", desc: "Sends an email message (Simulation/Server API)." },
    WAIT: { name: "Wait (Delay)", desc: "Pause flow execution." },
    WAIT_FOR_KEYWORD: { 
        name: "Wait for Keyword", 
        desc: "Collect users typing keywords.",
        regex_hint: "If enabled, keywords are treated as RegEx (e.g. ^start matches only start of message)."
    },
    WAIT_FOR_USER_REPLY: { name: "Wait for Reply", desc: "Wait for specific user input." },
    RANDOM_PICK: { name: "Pick Random", desc: "Select one item from list." },
    PICK_MULTIPLE: { name: "Pick Multiple", desc: "Select multiple items." },
    RANDOM_NUMBER: { name: "Random Number", desc: "Generate integer in range." },
    RANDOM_EMOTE: { name: "Random Emote", desc: "Pick random channel emote." },
    RANDOM_CHATTER: { name: "Random Chatter", desc: "Pick random active user." },
    ITERATE: { name: "Loop (Iterate)", desc: "Run actions for each item." },
    JOIN_STRING: { name: "Join List (Format)", desc: "Combine a list into a string using a pattern." },
    POINTS_GET: { 
        name: "Get Points", 
        desc: "Get user currency balance.",
        target_hint: "Defaults to sender if empty/missing."
    },
    POINTS_MODIFY: { name: "Modify Points", desc: "Add/Remove/Set points." },
    TOP_USERS: { name: "Ranking (Top Users)", desc: "Get list of users sorted by points." },
    FETCH_API: { name: "Fetch API", desc: "Get external JSON data." },
    CREATE_CLIP: { name: "Create Clip", desc: "Captures the last 30s of stream. Requires Live Server." },
    CHECK_USER: { name: "Check User", desc: "Verify user exists (Twitch API) and fetch data." },
    RANK_CHECK: { name: "Rank Check", desc: "Check user permissions." },
    CONDITION: { name: "Condition", desc: "If/Else logic branches." },
    SET_VARIABLE: { name: "Set Variable", desc: "Store value in memory." },
    CALCULATE: { name: "Calculate", desc: "Math operations." },
    VALIDATE_NUMBER: { name: "Parse Number", desc: "Handle suffixes (k, m, %, all)." },
    JOIN: { name: "Barrier (Sync)", desc: "Wait for multiple inputs." },
    JUMP: { name: "Jump", desc: "Go to another node." },
    HANDLE_ERROR: { name: "Handle Error", desc: "Catch specific errors." },
    HALT: { name: "Halt Flow", desc: "Stop running commands." }
  }
};