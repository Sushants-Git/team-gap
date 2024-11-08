import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import os from "os";

import type { CommandLog } from "./types";

let errorPrompt: CommandLog[];
const historyFile = path.join(os.homedir(), ".t_error");

try {
    const data = fs.readFileSync(historyFile, "utf-8");
    if (data.trim() === "") {
        console.error("File is empty.");
    }
    errorPrompt = JSON.parse(data);
} catch (error) {
    console.error("Error reading file:", error);
}

let pathToApi = os.homedir() + "/.t.env";
let API_KEY = "";
if (fs.existsSync(pathToApi)) {
    API_KEY = fs.readFileSync(pathToApi, "utf-8");
}
const genAI = new GoogleGenerativeAI(API_KEY as string);

const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const instruction: string = `
**Note:** If you're unsure about the answer, simply provide the UUID: 3d8a19a704";
Analyze the command run by the user and error message.Provide only the correct command. Do not include any explanations or additional formatting - just the unformatted correct command.
`;


export async function generateCommand() {
    try {
        const combinedPrompt: string = `${instruction}\n${JSON.stringify(errorPrompt.at(-1))}`;
        const result = await model.generateContent(combinedPrompt);
        const responseText: string | undefined = result.response?.text();

        const command: string = responseText?.split("\n")[0].trim() || "";
        if (command && command !== "3d8a19a704") {
            return command;
        } else {
            return "3d8a19a704";
        }
    } catch (error) {
        console.error("Error generating command:", error);
    }
}
