import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const INDEX_FILE = join(ROOT, "registry.json");
const SECRET_KEY_ENV = "MINISIGN_SECRET_KEY_FILE";
const PASSWORD_ENV = "MINISIGN_SECRET_KEY_PASSWORD";

interface Artifact {
  platform: string;
  url: string;
  sha256: string;
  signature: string;
}

interface Version {
  version: string;
  engines: { app: string; pluginApi: number };
  artifacts: Artifact[];
}

interface Plugin {
  id: string;
  displayName: string;
  description: string;
  publisher: string;
  homepage?: string;
  latest: string;
  versions: Version[];
}

interface Index {
  schemaVersion: number;
  updatedAt: string;
  plugins: Plugin[];
}

interface Args {
  id: string;
  version: string;
  enginesApp: string;
  pluginApi: number;
  artifacts: { platform: string; url: string }[];
  displayName?: string;
  description?: string;
  publisher?: string;
  homepage?: string;
}

function usage(): never {
  console.error(
    [
      "Usage: bun scripts/add-listing.ts \\",
      "  --id <plugin id> --version <semver> \\",
      '  --engines-app "<semver range>" --plugin-api <n> \\',
      "  --artifact <platform>=<url> [--artifact ...] \\",
      "  [--display-name <name> --description <text> --publisher <name> --homepage <url>]",
      "",
      `Signs each artifact with the key at $${SECRET_KEY_ENV}, unlocked with $${PASSWORD_ENV}.`,
    ].join("\n"),
  );
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const artifacts: { platform: string; url: string }[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[++i];
    if (!flag?.startsWith("--") || value === undefined) {
      usage();
    }
    if (flag === "--artifact") {
      const split = value.indexOf("=");
      if (split <= 0) {
        usage();
      }
      artifacts.push({ platform: value.slice(0, split), url: value.slice(split + 1) });
      continue;
    }
    flags[flag] = value;
  }

  const id = flags["--id"];
  const version = flags["--version"];
  const enginesApp = flags["--engines-app"];
  const pluginApi = Number(flags["--plugin-api"]);
  if (!id || !version || !enginesApp || !Number.isInteger(pluginApi) || artifacts.length === 0) {
    usage();
  }

  return {
    id,
    version,
    enginesApp,
    pluginApi,
    artifacts,
    displayName: flags["--display-name"],
    description: flags["--description"],
    publisher: flags["--publisher"],
    homepage: flags["--homepage"],
  };
}

interface SigningKey {
  secretKeyFile: string;
  password: string;
}

function requireSigningKey(): SigningKey {
  const secretKeyFile = process.env[SECRET_KEY_ENV];
  const password = process.env[PASSWORD_ENV];
  if (!secretKeyFile || !password) {
    throw new Error(`Set ${SECRET_KEY_ENV} and ${PASSWORD_ENV} before signing`);
  }
  if (!Bun.which("minisign")) {
    throw new Error("minisign is not on PATH; install it before signing");
  }
  return { secretKeyFile, password };
}

async function signArtifact(
  bytes: Uint8Array,
  label: string,
  key: SigningKey,
): Promise<string> {
  const { secretKeyFile, password } = key;
  const artifactFile = join(ROOT, ".tmp", `${label}.dbxplugin`);
  const signatureFile = `${artifactFile}.minisig`;
  await Bun.write(artifactFile, bytes);

  const signed = Bun.spawnSync(
    ["minisign", "-S", "-s", secretKeyFile, "-m", artifactFile, "-x", signatureFile],
    { stdin: Buffer.from(`${password}\n`, "utf8") },
  );
  if (signed.exitCode !== 0) {
    throw new Error(`minisign refused to sign ${label}: ${signed.stderr.toString()}`);
  }
  return await readFile(signatureFile, "utf8");
}

async function describeArtifact(
  entry: { platform: string; url: string },
  version: string,
  key: SigningKey,
): Promise<Artifact> {
  const response = await fetch(entry.url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`${entry.url} answered with status ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    platform: entry.platform,
    url: entry.url,
    sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
    signature: await signArtifact(bytes, `${version}-${entry.platform}`, key),
  };
}

function newestVersion(versions: Version[]): string {
  return [...versions].sort((left, right) => Bun.semver.order(right.version, left.version))[0]!
    .version;
}

const args = parseArgs(process.argv.slice(2));
const signingKey = requireSigningKey();
const index = JSON.parse(await readFile(INDEX_FILE, "utf8")) as Index;

let plugin = index.plugins.find((candidate) => candidate.id === args.id);
if (plugin?.versions.some((candidate) => candidate.version === args.version)) {
  throw new Error(`${args.id}@${args.version} is already listed; versions are never replaced`);
}
if (!plugin && (!args.displayName || !args.description || !args.publisher)) {
  throw new Error(
    `${args.id} is not listed yet; pass --display-name, --description and --publisher`,
  );
}

const artifacts: Artifact[] = [];
for (const entry of args.artifacts) {
  artifacts.push(await describeArtifact(entry, args.version, signingKey));
}

if (!plugin) {
  plugin = {
    id: args.id,
    displayName: args.displayName!,
    description: args.description!,
    publisher: args.publisher!,
    latest: args.version,
    versions: [],
  };
  if (args.homepage) {
    plugin.homepage = args.homepage;
  }
  index.plugins.push(plugin);
}

plugin.versions.push({
  version: args.version,
  engines: { app: args.enginesApp, pluginApi: args.pluginApi },
  artifacts,
});
plugin.versions.sort((left, right) => Bun.semver.order(left.version, right.version));
plugin.latest = newestVersion(plugin.versions);
index.plugins.sort((left, right) => left.id.localeCompare(right.id));
index.updatedAt = new Date().toISOString();

await writeFile(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log(`Listed ${args.id}@${args.version} (${artifacts.length} artifact(s))`);
