
import { GoogleGenAI } from "@google/genai";

export class AiAuditor {
    static getAi() {
        if (!process.env.API_KEY) return null;
        return new GoogleGenAI({ apiKey: process.env.API_KEY });
    }

    static getReplacer() {
        return (key, value) => {
            // Aggressive Token Optimization:
            // Keep ONLY logic (type, settings, children/branches).
            // Strip all UI data (position, zones, waypoints) and Metadata (ids, timestamps, provider).
            const ignoredKeys = [
                'position', 'zones', 'waypoints', 'x', 'y', 'width', 'height', 'color', 
                'id', 'repoId', 'repoVersion', 'updatedAt', 'createdAt', '_id', '__v',
                'channelId', 'provider', 'enabled', 'isBuiltIn'
            ];
            if (ignoredKeys.includes(key)) return undefined;
            return value;
        };
    }

    static async auditCommand(commandData) {
        const ai = this.getAi();
        if (!ai) {
            console.warn("[AiAuditor] No API Key provided. Skipping audit.");
            return {
                description: "No AI Analysis (Missing Key)",
                executionDescription: "Analysis unavailable.",
                tags: ["Unverified"],
                isSafe: true, 
                toxicityReason: null,
                detailedReport: "AI API Key missing on server.",
                primaryCategory: "General",
                subCategories: []
            };
        }

        try {
            const replacer = this.getReplacer();
            const slimCommand = JSON.parse(JSON.stringify(commandData, replacer));

            const prompt = `
            You are a security auditor and documentation generator for a Twitch Chat Bot logic flow.
            Analyze the following JSON logic structure.

            Tasks:
            1. **Description**: A 1-sentence marketing summary.
            2. **Execution Description**: A step-by-step technical explanation of what happens when the command runs (e.g., "1. Checks user points. 2. If > 100, rolls dice. 3. Sends message.").
            3. **Tags**: Generate 3-5 relevant tags.
            4. **Safety**: Analyze for malicious loops, spam, or hate speech.
            5. **Categorization**: 
               - Select the ONE BEST **primaryCategory** from: [Minigames, Economy, AI & Utility, Fun, Moderation, Utility].
               - Generate a list of **subCategories** that also fit.

            Command Logic:
            ${JSON.stringify(slimCommand).substring(0, 15000)}

            Return ONLY raw JSON:
            {
                "description": "string",
                "executionDescription": "string",
                "tags": ["string"],
                "isSafe": boolean,
                "toxicityReason": "string or null",
                "detailedReport": "string (detailed analysis + usage guide)",
                "primaryCategory": "string",
                "subCategories": ["string"]
            }
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    responseMimeType: "application/json"
                }
            });

            const text = response.text || "{}";
            const result = JSON.parse(text);
            
            // Fallback for primaryCategory if AI fails to match enum
            const validCats = ['Minigames', 'Economy', 'AI & Utility', 'Fun', 'Moderation', 'Utility'];
            if (!validCats.includes(result.primaryCategory)) {
                result.primaryCategory = 'General';
            }

            return result;

        } catch (e) {
            console.error("[AiAuditor] Analysis failed:", e);
            return {
                description: "AI Analysis Failed",
                executionDescription: "Analysis failed.",
                tags: ["Error"],
                isSafe: true, 
                toxicityReason: "Analysis Error",
                detailedReport: `Analysis failed: ${e.message}`,
                primaryCategory: "General",
                subCategories: []
            };
        }
    }

    static async generateChangelog(oldCommand, newCommand) {
        const ai = this.getAi();
        if (!ai) return "Changelog unavailable (Missing API Key)";

        try {
            const replacer = this.getReplacer();

            const oldSlim = JSON.stringify(oldCommand, replacer);
            const newSlim = JSON.stringify(newCommand, replacer);

            if (oldSlim === newSlim) return "No logic changes detected.";

            const prompt = `
            You are a technical writer for a visual programming changelog.
            Compare the OLD command version vs the NEW command version.
            
            Identify what changed in the logic, settings, triggers, or responses.
            Visual layout changes have been removed from this data.
            
            OLD:
            ${oldSlim.substring(0, 10000)}

            NEW:
            ${newSlim.substring(0, 10000)}

            Output a concise bulleted list (Markdown) of changes. Start with "Changes in this version:".
            Example:
            - Changed trigger from "!help" to "!info".
            - Added a check for user points.
            - Updated the success message.
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt
            });

            return response.text || "Changelog generation failed.";

        } catch (e) {
            console.error("[AiAuditor] Changelog failed:", e);
            return "Changelog generation failed due to an error.";
        }
    }
}
