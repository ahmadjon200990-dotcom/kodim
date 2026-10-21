// Terminal ruxsat tekshiruvi testlari (CLAUDE.md 0.8.2): har shell o'z sintaksisi bilan.
// Ishga tushirish: pnpm --filter @exam-ide/shared test  (Node 22.18+/24 — TypeScript'ni o'zi o'qiydi)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkCommand, DEFAULT_ALLOWED_COMMANDS, isShellAllowed, type ShellKind } from "../src/commands.ts";

const ALLOWED = [...DEFAULT_ALLOWED_COMMANDS, "python", "pip install"];

function verdict(line: string, shell: ShellKind): string {
  const v = checkCommand(line, ALLOWED, shell);
  return v.ok ? "OK" : v.reason;
}

function expectAll(shell: ShellKind, cases: Record<string, string>): void {
  for (const [line, expected] of Object.entries(cases)) {
    assert.equal(verdict(line, shell), expected, `${shell}: ${JSON.stringify(line)}`);
  }
}

/** Har uchala shell'da bir xil natija beradigan oddiy buyruqlar. */
const COMMON: Record<string, string> = {
  "npm install": "OK",
  "npm i react": "OK",
  "npm run dev": "OK",
  "npm run start": "OK",
  "npm create vite@latest": "NOT_ALLOWED",
  "npm create vite": "OK",
  "npx vite": "OK",
  "node index.js": "OK",
  "node -v": "OK",
  "node.exe index.js": "OK",
  "NODE index.js": "OK",
  "node server.js -p 3000": "OK",
  "python main.py": "OK",
  "pip install requests": "OK",
  "cd src": "OK",
  "ls": "OK",
  "dir": "OK",
  "mkdir components": "OK",
  "cls": "OK",
  "clear": "OK",
  "exit": "OK",
  "": "EMPTY",
  "   ": "EMPTY",
  // Ruxsat etilmagan dasturlar
  "curl https://example.com": "NOT_ALLOWED",
  "wget https://example.com": "NOT_ALLOWED",
  "git clone https://github.com/x/y": "NOT_ALLOWED",
  "code .": "NOT_ALLOWED",
  "claude": "NOT_ALLOWED",
  "explorer .": "NOT_ALLOWED",
  // Kodni buyruq qatorida bajarish
  "node -e x": "INLINE_CODE",
  "node --eval x": "INLINE_CODE",
  "node -p 1+1": "INLINE_CODE",
  "node --require ./hack.js app.js": "INLINE_CODE",
  "node --no-warnings -e x": "INLINE_CODE",
  "python -c x": "INLINE_CODE",
  "npx -c whoami": "INLINE_CODE",
  // Boshqa shell'ni chaqirish
  "cmd /c dir": "BYPASS",
  "cmd.exe": "BYPASS",
  "powershell -c ls": "BYPASS",
  "pwsh": "BYPASS",
  "bash -c ls": "BYPASS",
  "sh script.sh": "BYPASS",
  "wsl ls": "BYPASS",
};

describe("checkCommand — PowerShell", () => {
  it("oddiy buyruqlar", () => expectAll("powershell", COMMON));
  it("zanjirlash va yo'naltirish bloklanadi", () =>
    expectAll("powershell", {
      "node -v; curl x": "CHAINING",
      "npm i && curl x": "CHAINING",
      "npm i || curl x": "CHAINING",
      "node -v | Out-File a.txt": "CHAINING",
      "node -v > a.txt": "CHAINING",
      "node -v >> a.txt": "CHAINING",
      "node < in.txt": "CHAINING",
      "node $(iwr x)": "CHAINING",
      "node @(1,2)": "CHAINING",
      "& curl.exe x": "CHAINING",
      "node `curl`": "CHAINING",
      "npm run dev &": "CHAINING",
      "npm run dev\ncurl x": "CHAINING",
    }));
  it("aylanib o'tish bloklanadi", () =>
    expectAll("powershell", {
      "iex 'curl x'": "BYPASS",
      "Invoke-Expression x": "BYPASS",
      "Start-Process chrome": "BYPASS",
      "saps chrome": "BYPASS",
      "start https://chatgpt.com": "BYPASS",
      "ii .": "BYPASS",
      "iwr https://x": "NOT_ALLOWED",
      "irm https://x": "NOT_ALLOWED",
    }));
});

describe("checkCommand — Command Prompt (cmd)", () => {
  it("oddiy buyruqlar", () => expectAll("cmd", COMMON));
  it("zanjirlash, yo'naltirish, qochirish va o'zgaruvchilar bloklanadi", () =>
    expectAll("cmd", {
      "node -v & curl x": "CHAINING",
      "node -v && curl x": "CHAINING",
      "node -v || curl x": "CHAINING",
      "node -v | find x": "CHAINING",
      "node -v > a.txt": "CHAINING",
      "node < in.txt": "CHAINING",
      "node -v ^& curl x": "CHAINING",
      "c^url x": "CHAINING",
      "%COMSPEC% /c dir": "CHAINING",
      "node %X%": "CHAINING",
      "node !X!": "CHAINING",
    }));
  it("aylanib o'tish bloklanadi", () =>
    expectAll("cmd", {
      "start chrome": "BYPASS",
      "start https://chatgpt.com": "BYPASS",
      "call x.bat": "BYPASS",
      "for /f %i in (a) do curl": "BYPASS",
      "for x": "BYPASS",
      "wmic process call create calc": "BYPASS",
      "mshta x": "BYPASS",
      "rundll32 x": "BYPASS",
    }));
});

describe("checkCommand — bash (Git Bash, WSL)", () => {
  for (const shell of ["gitbash", "wsl"] as const) {
    it(`${shell}: oddiy buyruqlar`, () => expectAll(shell, COMMON));
    it(`${shell}: zanjirlash, subshell va o'zgaruvchilar bloklanadi`, () =>
      expectAll(shell, {
        "node -v; curl x": "CHAINING",
        "node -v && curl x": "CHAINING",
        "node -v || curl x": "CHAINING",
        "node -v | sh": "CHAINING",
        "node -v & curl x": "CHAINING",
        "node $(curl x)": "CHAINING",
        "node `curl x`": "CHAINING",
        "node -v > a.txt": "CHAINING",
        "node < in.txt": "CHAINING",
        "node <(curl x)": "CHAINING",
        "(curl x)": "CHAINING",
        "{ curl x; }": "CHAINING",
        "node $X": "CHAINING",
        "node ${X}": "CHAINING",
        "$SHELL": "CHAINING",
      }));
    it(`${shell}: aylanib o'tish bloklanadi`, () =>
      expectAll(shell, {
        "eval curl x": "BYPASS",
        "exec curl x": "BYPASS",
        "source x.sh": "BYPASS",
        ". x.sh": "BYPASS",
        "sh -c curl": "BYPASS",
        "bash -c curl": "BYPASS",
        "env curl x": "BYPASS",
        "xargs curl": "BYPASS",
        "nohup curl x": "BYPASS",
        "command curl x": "BYPASS",
        "zsh": "BYPASS",
      }));
  }
  it("wsl: sudo bloklanadi", () => assert.equal(verdict("sudo apt install curl", "wsl"), "BYPASS"));
  it("cd . va ls . zararsiz (nuqta faqat buyruq bo'lsa bloklanadi)", () =>
    expectAll("gitbash", { "cd .": "OK", "ls .": "OK", "cd ..": "OK" }));
});

describe("o'qituvchi aniq ruxsat bergan buyruq", () => {
  it("o'qituvchi 'bash' ni ruxsat etsa — ishlaydi, lekin zanjirlash baribir bloklanadi", () => {
    assert.equal(checkCommand("bash run.sh", ["bash"], "gitbash").ok, true);
    assert.equal(checkCommand("bash run.sh; curl x", ["bash"], "gitbash").ok, false);
  });
  it("naqsh birinchi so'zlar bo'yicha", () => {
    assert.equal(checkCommand("npm test", ["npm test"], "powershell").ok, true);
    assert.equal(checkCommand("npm publish", ["npm test"], "powershell").ok, false);
  });
});

describe("isShellAllowed", () => {
  it("bo'sh ro'yxat — hammasi", () => assert.equal(isShellAllowed("cmd", []), true));
  it("faqat tanlanganlar", () => {
    assert.equal(isShellAllowed("powershell", ["powershell"]), true);
    assert.equal(isShellAllowed("gitbash", ["powershell"]), false);
  });
});
