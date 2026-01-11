
import { GoogleGenAI } from "@google/genai";
import { ActionType } from '../types.js';

export class AiBuilder {
    static getAi() {
        if (!process.env.API_KEY) return null;
        return new GoogleGenAI({ apiKey: process.env.API_KEY });
    }

    static async generateCommand(userPrompt, existingCommand = null) {
        const ai = this.getAi();
        if (!ai) throw new Error("API_KEY_MISSING");

        // Definition of the command structure for the AI
        const SYSTEM_INSTRUCTION = `
        You are an expert Solutions Architect for "Gemini Bot Flow Studio". 
        Your goal is to convert natural language requests into a valid JSON Command structure for this specific application.

        ### PROJECT CONTEXT & DOCUMENTATION
        "Gemini Bot Flow Studio" is a high-end, node-based visual programming environment for Twitch bots.
        It uses a flow-based architecture where execution moves from a START node through various Logic, Action, and Data nodes.

        **Key Concepts:**
        1. **Variables**: Accessed via \`{variableName}\`. 
           - System: \`{sender.displayName}\`, \`{sender.points}\`, \`{channel.currencySymbol}\`.
           - Arguments: \`{args.0}\` (1st arg), \`{args.1}\`, \`{args.all}\`.
           - Time: \`{datetime.time}\`.
        2. **Coordinates**: You MUST calculate \`position\` {x, y} for every node to layout them visually.
           - Start at x:50, y:50.
           - Flow moves RIGHT (increase X by 400).
           - Branches move DOWN (increase Y by 350). Do not stack nodes on top of each other.
        3. **Error Handling**: Many nodes have an \`errorChildren\` array for handling failures (e.g., User Not Found).

        ### OUTPUT FORMAT
        Return a SINGLE JSON object representing a 'Command'.
        {
          "id": "uuid-string",
          "name": "Command Name",
          "enabled": true,
          "category": "General",
          "rootAction": {
             "id": "uuid",
             "type": "START",
             "settings": { "triggers": "!trigger" },
             "position": { "x": 50, "y": 50 },
             "children": [ ... ]
          }
        }

        ### NODE REFERENCE (Strict Schema)
        Use ONLY these types.

        1. **START** (Entry Point)
           - settings: { "triggers": "!cmd, !alias", "onlyOnline": boolean }

        2. **SAY** (Chat Message)
           - settings: { "message": "Hello @{sender.displayName}! You have {userPoints} points." }

        3. **AI_CHAT** (LLM Generation)
           - settings: { 
               "prompt": "Question: {args}", 
               "systemInstruction": "Persona...", 
               "resultVar": "ai_response",
               "model": "Gemini Flash",
               "useMemory": true
             }
           
        4. **POINTS_GET** (Fetch Balance)
           - settings: { "target": "@{sender}", "resultVar": "userPoints" }
        
        5. **POINTS_MODIFY** (Transaction)
           - settings: { "target": "@{sender}", "amount": "100", "operation": "add" | "remove" | "set" }
        
        6. **RANK_CHECK** (Permission)
           - settings: { "requiredRanks": ["Broadcaster", "Moderator", "VIP"] }
           - Logic: Put authorized actions in \`children\`. Put rejection message in \`errorChildren\`.

        7. **CONDITION** (Logic Branching)
           - settings: {
               "conditions": [
                 { "id": "cond_1", "name": "Check > 100", "left": "{userPoints}", "op": ">", "right": "100" }
               ]
             }
           - Use 'branches' object: { "cond_1": [...], "ELSE": [...] }

        8. **RANDOM_NUMBER** (RNG)
           - settings: { "min": "1", "max": "100", "resultVar": "roll" }

        9. **WAIT** (Delay)
           - settings: { "duration": "5" }

        10. **WAIT_FOR_KEYWORD** (Input Collection)
           - settings: { "keyword": "join", "duration": "30", "maxUsers": "0", "listVar": "participants" }

        11. **RANDOM_PICK** (Select Winner)
            - settings: { "source": "{participants}", "resultVar": "winner" }

        12. **FETCH_API** (External Data)
            - settings: { "url": "https://...", "method": "GET", "resultVar": "apiData" }

        13. **CREATE_CLIP** (Twitch Clip)
            - settings: { "title": "Clip Title", "createDelay": "0", "resultVar": "clipUrl" }

        ### LOGIC PATTERNS (Best Practices)
        - **Gamble**: START -> POINTS_GET -> CONDITION (funds >= bet) -> (True: RANDOM_NUMBER -> CONDITION (win/loss) -> MODIFY) -> (False: SAY "Not enough points").
        - **Duel**: START -> CHECK_ARG (target exists) -> POINTS_GET (sender) -> POINTS_GET (target) -> SAY "Accept?" -> WAIT_FOR_USER_REPLY -> CONDITION (accepted) -> RNG -> MODIFY.
        - **Raffle**: START -> SAY "Started" -> WAIT_FOR_KEYWORD -> RANDOM_PICK -> MODIFY (add prize) -> SAY "Winner is {winner}".

        ### REQUEST
        Create a command based on: "${userPrompt}"
        `;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: SYSTEM_INSTRUCTION,
                config: {
                    responseMimeType: "application/json",
                    temperature: 0.2 // Low temperature for consistent JSON structure
                }
            });

            const text = response.text;
            if (!text) throw new Error("No response from AI");
            
            const json = JSON.parse(text);
            
            // Ensure ID uniqueness
            json.id = existingCommand ? existingCommand.id : crypto.randomUUID();
            // Ensure proper typing for rootAction
            if(!json.rootAction.id) json.rootAction.id = crypto.randomUUID();

            return json;

        } catch (e) {
            console.error("AI Builder Error:", e);
            
            let message = e.message || "Failed to generate command structure.";
            let status = e.status || 500;

            // Attempt to parse complex JSON error messages from API (e.g. ApiError: { "error": ... })
            if (typeof message === 'string' && (message.startsWith('{') || message.includes('{"error":'))) {
                try {
                    const jsonStart = message.indexOf('{');
                    const jsonStr = message.substring(jsonStart);
                    const parsed = JSON.parse(jsonStr);
                    
                    if (parsed.error) {
                        if (parsed.error.message) message = parsed.error.message;
                        if (parsed.error.code) status = parsed.error.code;
                    }
                } catch (parseErr) {
                    // Fallback to raw message if parse fails
                }
            }
            
            // Check for specific quota codes and provide user-friendly message
            if (status === 429 || message.includes("429") || message.includes("quota")) {
                message = "AI Quota Exceeded. The server is busy or you hit the free tier limit. Please wait a moment and try again.";
                status = 429;
            }

            const err = new Error(message);
            err.status = status;
            throw err;
        }
    }
}
