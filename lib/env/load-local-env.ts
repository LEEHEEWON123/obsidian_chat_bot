import { readFileSync } from "fs";

/** Load `.env.local` into process.env (only keys not already set). */
export function loadLocalEnv(): void {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
      if (process.env[key] === undefined) {
        process.env[key] = match[2].trim();
      }
    }
  } catch {
    // .env.local optional for some scripts
  }
}
