import fs from "fs";
import path from "path";
import os from "os";
import { GoogleGenerativeAI } from "@google/generative-ai";

import type { CommandLog } from "./types";

// Add this to your existing types.ts or create if doesn't exist
export type AIProvider = 'gemini' | 'azure';

interface Config {
    gemini_apiKey: string;
    azure_endpoint: string;
    azure_apiKey: string;
    azure_deploymentName: string;
    current_provider?: AIProvider;  // Add this to track current provider
}

interface OpenAIResponse {
    choices: {
        message: {
            content: string;
        };
    }[];
}

let errorPrompt: CommandLog[];
const errorFile = path.join(os.homedir(), ".t_error");
let currentProvider: AIProvider = 'gemini'; // Default to gemini

// Read configuration
let config: Config;
const configPath = path.join(os.homedir(), ".t.env");

try {
    if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, "utf-8");
        config = JSON.parse(configData);
        // Set initial provider from config if available
        currentProvider = config.current_provider || 'gemini';
    } else {
        throw new Error("Configuration file not found");
    }
} catch (error) {
    console.error("Error reading configuration:", error);
    process.exit(1);
}

const instructionForHm: string = `
- **Note:** If you're unsure of the correct response, or prefer not to answer for any reason, reply only with the UUID: 3d8a19a704.
- As an intelligent assistant, interpret the user's intent accurately. Provide precise shell commands in response, based on your analysis of the user's input and any errors they encountered.
- Your goal is to assist the user by giving them only the correct command they need to execute, formatted without explanations or additional details. Assume the user has a minimal shell environment installed and respond with the exact command they should run.
- Be concise and efficient, responding with only the command.
- platform ${process.platform}
`;

const instructionForHp: string = `
- **Note:** If you're unsure of the correct response, or prefer not to answer for any reason, reply only with the UUID: 3d8a19a704.
- You are a command-line assistant, helping users run commands in a shell environment. Analyze the user's input and determine the exact shell command they need to execute, assuming they have a basic installation.
- Respond solely with the unformatted command line instruction, omitting any explanations or extraneous text.
- Focus on providing precise commands, interpreting user input efficiently and accurately to meet their needs.
- platform ${process.platform}
`;

async function callGemini(prompt: string): Promise<string> {
    try {
        let genAI = new GoogleGenerativeAI(config.gemini_apiKey);
        let model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        const result = await model.generateContent(prompt);
        const responseText = result.response?.text();
        return responseText?.split("\n")[0].trim() || "3d8a19a704";
    } catch (error) {
        console.error('Error calling Gemini:', error);
        return "3d8a19a704";
    }
}

async function callAzureOpenAI(prompt: string): Promise<string> {
    try {
        const response = await fetch(
            `${config.azure_endpoint}openai/deployments/${config.azure_deploymentName}/chat/completions?api-version=2023-05-15`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': config.azure_apiKey
                },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 100,
                    temperature: 0.7
                })
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json() as OpenAIResponse;
        return data.choices[0]?.message.content || "3d8a19a704";
    } catch (error) {
        console.error('Error calling Azure OpenAI:', error);
        return "3d8a19a704";
    }
}

async function callAI(prompt: string): Promise<string> {
    return currentProvider === 'azure' ?
        await callAzureOpenAI(prompt) :
        await callGemini(prompt);
}

export async function generateCommandForHm(): Promise<string> {
    try {
        if (fs.existsSync(errorFile)) {
            const data = fs.readFileSync(errorFile, "utf-8");
            if (data.trim() === "") {
                console.error("File is empty.");
                return "3d8a19a704";
            }
            errorPrompt = JSON.parse(data);
        }

        const combinedPrompt: string = `${instructionForHm}\n${JSON.stringify(errorPrompt.at(-1))}`;
        return await callAI(combinedPrompt);
    } catch (error) {
        console.error("Error generating command:", error);
        return "3d8a19a704";
    }
}

export async function generateCommandForHp(message: string): Promise<string> {
    try {
        const combinedPrompt: string = `${instructionForHp}\n${message}`;
        return await callAI(combinedPrompt);
    } catch (error) {
        console.error("Error generating command:", error);
        return "3d8a19a704";
    }
}

// Export the current provider and a function to change it
export const getCurrentProvider = (): AIProvider => currentProvider;
export const setProvider = (provider: AIProvider): void => {
    currentProvider = provider;
    // Optionally save to config file
    config.current_provider = provider;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
};
