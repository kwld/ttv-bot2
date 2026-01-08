
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
        You are an expert architect for "Gemini Bot Flow Studio". Your goal is to convert natural language requests into a valid JSON Command structure.

        ### OUTPUT FORMAT
        You must return a SINGLE JSON object representing a 'Command'.
        Structure:
        {
          "id": "uuid-string",
          "name": "Command Name",
          "enabled": true,
          "trigger": "!trigger",
          "globalCooldown": 0,
          "userCooldown": 0,
          "category": "General",
          "rootAction": {
             "id": "uuid",
             "type": "START",
             "settings": { "triggers": "!trigger" },
             "position": { "x": 50, "y": 50 },
             "children": [ ... next nodes ... ]
          }
        }

        ### NODE COORDINATES (CRITICAL)
        - You MUST calculate 'position': { "x": number, "y": number } for EVERY node.
        - Start Node: x: 50, y: 50.
        - Direct Children: Increase X by 400. Keep Y same.
        - Branches (Condition/Error): Keep X same, increase Y by 350 for each branch/case to stack them vertically.
        - DO NOT overlap nodes.

        ### AVAILABLE NODE TYPES (ActionType) & SETTINGS
        Use ONLY these types. Variables use curly braces e.g., {sender.displayName}, {args.0}.

        1. **SAY** (Send Chat Message)
           - settings: { "message": "Hello @{sender.displayName}!" }
        
        2. **WAIT** (Delay)
           - settings: { "duration": "5" } (seconds)

        3. **LOG** (Console Log)
           - settings: { "message": "Log this", "level": "info" }

        4. **AI_CHAT** (Ask Gemini)
           - settings: { 
               "prompt": "Question: {args}", 
               "systemInstruction": "You are a pirate.", 
               "resultVar": "ai_response",
               "model": "Gemini Flash",
               "useMemory": true
             }
           - Output variable: {ai_response}

        5. **POINTS_GET** (Get User Balance)
           - settings: { "target": "@{sender}", "resultVar": "userPoints" }
           - Output variable: {userPoints}

        6. **POINTS_MODIFY** (Add/Remove Points)
           - settings: { "target": "@{sender}", "amount": "100", "operation": "add" | "remove" | "set" }

        7. **RANDOM_NUMBER** (RNG)
           - settings: { "min": "1", "max": "100", "resultVar": "roll" }
           - Output variable: {roll}

        8. **CONDITION** (If/Else Logic)
           - settings: {
               "conditions": [
                 { "id": "cond_1", "name": "Points > 100", "left": "{userPoints}", "op": ">", "right": "100" }
               ]
             }
           - **IMPORTANT**: Use 'branches' object for logic paths.
           - Structure:
             "branches": {
                "cond_1": [ ... nodes if true ... ],
                "ELSE": [ ... nodes if false ... ]
             }

        9. **WAIT_FOR_KEYWORD** (Collect responses)
           - settings: { "keyword": "join", "duration": "30", "maxUsers": "0", "listVar": "participants" }
           - Output: {participants} (array)

        10. **RANDOM_PICK** (Pick winner)
            - settings: { "source": "{participants}", "resultVar": "winner" }
            - Output: {winner}

        11. **FETCH_API** (External Request)
            - settings: { "url": "https://api.xyz", "method": "GET", "resultVar": "apiData" }

        12. **ITERATE** (Loop)
            - settings: { "list": "{participants}", "varName": "item" }
            - Children run for every item.

        ### LOGIC RULES
        - If the user asks for a **Raffle/Giveaway**: Use START -> SAY -> WAIT_FOR_KEYWORD -> RANDOM_PICK -> SAY.
        - If the user asks for a **Gamble/Dice**: Use START -> POINTS_GET -> CONDITION (check funds) -> RANDOM_NUMBER -> CONDITION (check win) -> POINTS_MODIFY.
        - If the user asks for **AI**: Use START -> AI_CHAT -> SAY.
        
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
