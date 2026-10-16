import { existsSync, readdirSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { userHome } from "./canon/build.js";

const isWin = platform() === "win32";
const isMac = platform() === "darwin";

export const cliPath = (): string => resolve(dirname(fileURLToPath(import.meta.url)), "cli.js");
export const defaultRoot = (): string => join(userHome(), "projects");

export const claudeDesktopConfigCandidates = (): string[] => {
  const home = homedir();
  if (isMac) return [join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")];
  if (isWin) {
    const out: string[] = [];
    const local = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    const packages = join(local, "Packages");
    if (existsSync(packages)) for (const dir of readdirSync(packages).filter((d) => /^Claude_/i.test(d))) out.push(join(packages, dir, "LocalCache", "Roaming", "Claude", "claude_desktop_config.json"));
    out.push(join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json"));
    return out;
  }
  return [join(home, ".config", "Claude", "claude_desktop_config.json")];
};

export const mcpServerEntry = (root: string) => ({ command: process.execPath, args: [cliPath(), "-r", resolve(root), "mcp"] });

/** Add the brand-genome server to Claude Desktop's config. Additive, with a backup. */
export const installClaudeDesktop = async (root: string): Promise<{ path: string; backup: string | null }> => {
  const candidates = claudeDesktopConfigCandidates();
  const path = candidates.find((p) => existsSync(p)) ?? candidates.find((p) => existsSync(dirname(p))) ?? candidates.at(-1)!;
  let config: Record<string, unknown> = {};
  let backup: string | null = null;
  if (existsSync(path)) {
    const raw = await readFile(path, "utf8");
    try {
      config = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      throw new Error(`${path} não é um JSON válido; corrija ou cole o bloco de "brand mcp-config" à mão.`);
    }
    backup = `${path}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await copyFile(path, backup);
  } else await mkdir(dirname(path), { recursive: true });
  const servers = (config.mcpServers as Record<string, unknown> | undefined) ?? {};
  servers["brand-genome"] = mcpServerEntry(root);
  config.mcpServers = servers;
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
  return { path, backup };
};

export const doctor = async (): Promise<{ name: string; ok: boolean; required: boolean; detail: string; fix?: string }[]> => {
  const major = Number(process.versions.node.split(".")[0]);
  const checks = [{ name: "Node.js 22+", ok: major >= 22, required: true, detail: `v${process.versions.node}`, fix: "Instale o Node.js 22 LTS em nodejs.org." }];
  let chromium = "";
  try {
    const mod = (await import("playwright" as string)) as { chromium: { launch: (o: object) => Promise<{ version: () => string; close: () => Promise<void> }> } };
    const b = await mod.chromium.launch({ headless: true });
    chromium = b.version();
    await b.close();
  } catch {
    /* optional */
  }
  checks.push({ name: "Chromium (sites montados por JavaScript)", ok: Boolean(chromium), required: false, detail: chromium || "não instalado: sites comuns funcionam; sites só em JavaScript ficam com pouco texto", fix: "npx playwright install chromium" });
  return checks;
};
