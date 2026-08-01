import { spawn } from "node:child_process";
import path from "node:path";
import { projectDirectory } from "./env-config.mjs";
import { validateEmailAddress } from "./email-address.mjs";

const outlookCheckScript = path.join(
  projectDirectory,
  "scripts",
  "check-outlook-classic.ps1",
);

function runOutlookCheck(sender, options = {}) {
  const normalizedSender = validateEmailAddress(sender, "Tu correo de Outlook");
  const spawnProcess = options.spawnProcess ?? spawn;
  const argumentsList = [
    "-NoLogo",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    outlookCheckScript,
    "-Sender",
    normalizedSender,
  ];
  if (options.sendTest === true) argumentsList.push("-SendTest");

  return new Promise((resolve, reject) => {
    const child = spawnProcess("powershell.exe", argumentsList, {
      cwd: projectDirectory,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve({ sender: normalizedSender, message: stdout.trim() });
        return;
      }
      const lines = `${stderr}\n${stdout}`
        .split(/\r?\n/)
        .map((line) => line.replace(/^.*?:\s*/, "").trim())
        .filter(Boolean);
      reject(new Error(lines[0] ?? `Outlook terminó con código ${code}.`));
    });
  });
}

export function verifyOutlookAccount(sender, options = {}) {
  return runOutlookCheck(sender, options);
}

export function sendOutlookTestEmail(sender, options = {}) {
  return runOutlookCheck(sender, { ...options, sendTest: true });
}
