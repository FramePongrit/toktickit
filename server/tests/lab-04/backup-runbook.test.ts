import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const POWERSHELL = process.platform === "win32" ? "powershell.exe" : undefined;
const windowsIt = POWERSHELL ? it : it.skip;

let temporaryRoot: string;
let backupScript: string;
let restoreScript: string;

async function readRunbookScripts(): Promise<[string, string]> {
  const readme = await fs.readFile(path.join(REPOSITORY_ROOT, "README.md"), "utf8");
  const blocks = [...readme.matchAll(/```powershell\r?\n([\s\S]*?)\r?\n```/g)].map((match) => match[1]);
  expect(blocks).toHaveLength(2);
  return [blocks[0], blocks[1]];
}

function safePowerShellEnvironment(values: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (/DATABASE_URL|PASSWORD|JWT|TOKEN|COOKIE|SECRET|^PG/i.test(name) || /^PSModulePath$/i.test(name)) {
      delete environment[name];
    }
  }
  return { ...environment, ...values };
}

async function runPowerShell(label: string, script: string, variables: NodeJS.ProcessEnv) {
  const scriptPath = path.join(temporaryRoot, `${label}.ps1`);
  await fs.writeFile(scriptPath, `Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop\n${script}`, "utf8");
  try {
    const output = execFileSync(
      POWERSHELL!,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { encoding: "utf8", env: safePowerShellEnvironment(variables), stdio: ["ignore", "pipe", "pipe"] }
    );
    return { exitCode: 0, output };
  } catch (error) {
    const commandError = error as Error & { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      exitCode: commandError.status ?? -1,
      output: [commandError.stdout, commandError.stderr].map(String).join("\n"),
    };
  }
}

function sanitizedPowerShellOutput(output: string): string {
  return output
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://[redacted]@")
    .replace(/((?:DATABASE_URL|PGPASSWORD|PASSWORD|JWT(?:_SECRET)?|TOKEN|COOKIE|SECRET)\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]");
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "toktickit-lab4-runbook-"));
  [backupScript, restoreScript] = await readRunbookScripts();
});

afterAll(async () => {
  if (temporaryRoot) await fs.rm(temporaryRoot, { recursive: true, force: true });
});

describe("Lab 4 backup and restore runbook", () => {
  windowsIt("uses Windows PowerShell defaults when the parent has a PowerShell 7 module path", async () => {
    const file = path.join(temporaryRoot, "module-path-hash.txt");
    const contents = Buffer.from("hash through the real Windows PowerShell utility module\n");
    await fs.writeFile(file, contents);

    const inheritedModulePaths = Object.entries(process.env).filter(([name]) => /^PSModulePath$/i.test(name));
    try {
      for (const [name] of inheritedModulePaths) delete process.env[name];
      process.env.pSmOdUlEpAtH = "C:\\Program Files\\PowerShell\\7\\Modules";

      const result = await runPowerShell(
        "poisoned-module-path",
        String.raw`
if ($env:PSModulePath -match 'PowerShell\\7\\Modules') { throw 'PSMODULEPATH_POISONED' }
(Get-FileHash -LiteralPath $env:HASH_FILE -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
`,
        { HASH_FILE: file }
      );

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain(createHash("sha256").update(contents).digest("hex"));
      expect(result.output).not.toContain("PSMODULEPATH_POISONED");
    } finally {
      for (const name of Object.keys(process.env)) {
        if (/^PSModulePath$/i.test(name)) delete process.env[name];
      }
      for (const [name, value] of inheritedModulePaths) process.env[name] = value;
    }
  });

  windowsIt("hashes source uploads before copying and rejects a corrupted backup copy", async () => {
    const backupParent = path.join(temporaryRoot, "backup-parent");
    const sourceRoot = path.join(temporaryRoot, "source-uploads");
    await fs.mkdir(backupParent);
    await fs.mkdir(sourceRoot);
    const originalBytes = Buffer.from("original attachment bytes\n");
    await fs.writeFile(path.join(sourceRoot, "fixture.bin"), originalBytes);

    const stubs = String.raw`
function git {
  if ($args -contains '--show-toplevel') { Write-Output $env:TEST_REPO_ROOT }
  else { Write-Output 'fixture-git-sha' }
  $global:LASTEXITCODE = 0
}
function pg_dump {
  $fileIndex = [array]::IndexOf($args, '--file')
  [IO.File]::WriteAllText([string]$args[$fileIndex + 1], 'fixture database dump')
  $global:LASTEXITCODE = 0
}
function Copy-Item {
  param([string]$LiteralPath, [string]$Destination)
  Microsoft.PowerShell.Management\Copy-Item -LiteralPath $LiteralPath -Destination $Destination
  [IO.File]::AppendAllText($Destination, 'copy corruption')
}
`;
    const result = await runPowerShell("corrupt-backup-copy", `${stubs}\n${backupScript}`, {
      BACKUP_ROOT: backupParent,
      UPLOAD_DIR: sourceRoot,
      PGDATABASE: "fixture_database",
      TEST_REPO_ROOT: REPOSITORY_ROOT,
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("BACKUP_UPLOAD_COPY_MISMATCH");
    const backupDirectory = (await fs.readdir(backupParent))[0];
    const backupRoot = path.join(backupParent, backupDirectory);
    const manifest = await fs.readFile(path.join(backupRoot, "uploads-sha256.csv"), "utf8");
    expect(manifest.toLowerCase()).toContain(createHash("sha256").update(originalBytes).digest("hex"));
    expect(await fs.readFile(path.join(sourceRoot, "fixture.bin"))).toEqual(originalBytes);
    expect(await fs.readFile(path.join(backupRoot, "uploads", "fixture.bin"))).not.toEqual(originalBytes);
  });

  windowsIt.each(["database.dump", "uploads", "uploads-sha256.csv"])(
    "fails before createdb when the backup is missing %s in a fresh PowerShell process",
    async (missingInput) => {
      const backupRoot = path.join(temporaryRoot, `missing-${missingInput.replaceAll(".", "-")}`);
      const createdbMarker = path.join(temporaryRoot, `createdb-${missingInput.replaceAll(".", "-")}.txt`);
      const restoreUploadRoot = path.join(temporaryRoot, `restore-${missingInput.replaceAll(".", "-")}`);
      await fs.mkdir(backupRoot);
      await fs.mkdir(path.join(backupRoot, "uploads"));
      await fs.writeFile(path.join(backupRoot, "database.dump"), "fixture database dump");
      await fs.writeFile(path.join(backupRoot, "uploads", "fixture.bin"), "attachment bytes");
      await fs.writeFile(path.join(backupRoot, "uploads-sha256.csv"), "RelativePath,SHA256\nfixture.bin,invalid\n");
      if (missingInput === "database.dump") await fs.rm(path.join(backupRoot, missingInput));
      else await fs.rm(path.join(backupRoot, missingInput), { recursive: true, force: true });

      const stubs = String.raw`
function createdb { [IO.File]::WriteAllText($env:CREATEDB_MARKER, 'called'); $global:LASTEXITCODE = 0 }
function pg_restore { $global:LASTEXITCODE = 0 }
`;
      const result = await runPowerShell(`missing-${missingInput.replaceAll(".", "-")}`, `${stubs}\n${restoreScript}`, {
        BACKUP_ROOT: backupRoot,
        PGDATABASE: "toktickit_restore_fixture",
        UPLOAD_DIR: restoreUploadRoot,
        CREATEDB_MARKER: createdbMarker,
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain("RESTORE_BACKUP_INCOMPLETE");
      expect(await pathExists(createdbMarker)).toBe(false);
      expect(await pathExists(restoreUploadRoot)).toBe(false);
    }
  );

  windowsIt("rejects altered backup bytes before createdb and accepts an empty upload inventory", async () => {
    const backupRoot = path.join(temporaryRoot, "altered-backup");
    const marker = path.join(temporaryRoot, "altered-createdb.txt");
    await fs.mkdir(path.join(backupRoot, "uploads"), { recursive: true });
    await fs.writeFile(path.join(backupRoot, "database.dump"), "fixture database dump");
    await fs.writeFile(path.join(backupRoot, "uploads", "fixture.bin"), "altered bytes");
    await fs.writeFile(
      path.join(backupRoot, "uploads-sha256.csv"),
      `RelativePath,SHA256\nfixture.bin,${createHash("sha256").update("original bytes").digest("hex")}\n`
    );
    const stubs = String.raw`
function createdb { [IO.File]::WriteAllText($env:CREATEDB_MARKER, 'called'); $global:LASTEXITCODE = 0 }
function pg_restore { $global:LASTEXITCODE = 0 }
`;
    const corrupted = await runPowerShell("altered-backup", `${stubs}\n${restoreScript}`, {
      BACKUP_ROOT: backupRoot,
      PGDATABASE: "toktickit_restore_altered",
      UPLOAD_DIR: path.join(temporaryRoot, "altered-restore"),
      CREATEDB_MARKER: marker,
    });
    expect(corrupted.exitCode).not.toBe(0);
    expect(corrupted.output).toContain("RESTORE_BACKUP_MISMATCH");
    expect(await pathExists(marker)).toBe(false);

    const emptyBackup = path.join(temporaryRoot, "empty-backup");
    const emptyMarker = path.join(temporaryRoot, "empty-createdb.txt");
    await fs.mkdir(path.join(emptyBackup, "uploads"), { recursive: true });
    await fs.writeFile(path.join(emptyBackup, "database.dump"), "fixture database dump");
    await fs.writeFile(path.join(emptyBackup, "uploads-sha256.csv"), "RelativePath,SHA256\n");
    const acceptedEmpty = await runPowerShell("empty-inventory", `${stubs}\n${restoreScript}`, {
      BACKUP_ROOT: emptyBackup,
      PGDATABASE: "toktickit_restore_empty",
      UPLOAD_DIR: path.join(temporaryRoot, "empty-restore"),
      CREATEDB_MARKER: emptyMarker,
    });
    expect(acceptedEmpty.exitCode, sanitizedPowerShellOutput(acceptedEmpty.output)).toBe(0);
    expect(await pathExists(emptyMarker)).toBe(true);
  });
});
