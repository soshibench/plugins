import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const INDEX_FILES = ["registry.json", "staging.json"];
const SCHEMA_FILE = join(ROOT, "schema", "registry.schema.json");
const PUBLIC_KEY_FILE = join(ROOT, "registry.pub");

const KNOWN_PLATFORMS = [
  "universal",
  "darwin-arm64",
  "darwin-x64",
  "linux-x64-gnu",
  "linux-arm64-gnu",
  "win32-x64-msvc",
];

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
  latest: string;
  versions: Version[];
}

interface Index {
  schemaVersion: number;
  updatedAt: string;
  plugins: Plugin[];
}

const problems: string[] = [];

function fail(message: string): void {
  problems.push(message);
}

async function validateSchema(index: unknown): Promise<void> {
  const schema = await Bun.file(SCHEMA_FILE).json();
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(index)) {
    for (const error of validate.errors ?? []) {
      fail(`schema: ${error.instancePath || "/"} ${error.message}`);
    }
  }
}

function validateShape(index: Index): void {
  const seen = new Set<string>();
  for (const plugin of index.plugins) {
    if (seen.has(plugin.id)) {
      fail(`${plugin.id} is listed more than once`);
    }
    seen.add(plugin.id);

    const versions = new Set<string>();
    for (const version of plugin.versions) {
      if (versions.has(version.version)) {
        fail(`${plugin.id} lists version ${version.version} more than once`);
      }
      versions.add(version.version);
      if (version.artifacts.length === 0) {
        fail(`${plugin.id}@${version.version} has no artifacts`);
      }
      const platforms = new Set<string>();
      for (const artifact of version.artifacts) {
        if (!KNOWN_PLATFORMS.includes(artifact.platform)) {
          fail(
            `${plugin.id}@${version.version} lists platform ${artifact.platform}, which Soshi Bench never asks for; use one of ${KNOWN_PLATFORMS.join(", ")}`,
          );
        }
        if (platforms.has(artifact.platform)) {
          fail(`${plugin.id}@${version.version} has two ${artifact.platform} artifacts`);
        }
        platforms.add(artifact.platform);
      }
    }
    if (!versions.has(plugin.latest)) {
      fail(`${plugin.id} says latest is ${plugin.latest}, which it does not list`);
    }
  }
}

async function fetchArtifact(artifact: Artifact): Promise<Uint8Array | null> {
  const response = await fetch(artifact.url, { redirect: "follow" });
  if (!response.ok) {
    fail(`${artifact.url} answered with status ${response.status}`);
    return null;
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function verifySignature(
  label: string,
  bytes: Uint8Array,
  artifact: Artifact,
  workDir: string,
): Promise<void> {
  const artifactFile = join(workDir, "artifact.dbxplugin");
  const signatureFile = `${artifactFile}.minisig`;
  await writeFile(artifactFile, bytes);
  await writeFile(signatureFile, artifact.signature, "utf8");

  const result = Bun.spawnSync([
    "minisign",
    "-V",
    "-p",
    PUBLIC_KEY_FILE,
    "-x",
    signatureFile,
    "-m",
    artifactFile,
  ]);
  if (result.exitCode !== 0) {
    fail(`${label}: signature does not verify against registry.pub`);
  }
}

async function validateArtifacts(index: Index): Promise<void> {
  const workDir = await mkdtemp(join(tmpdir(), "registry-validate-"));
  try {
    for (const plugin of index.plugins) {
      for (const version of plugin.versions) {
        for (const artifact of version.artifacts) {
          const label = `${plugin.id}@${version.version} (${artifact.platform})`;
          const bytes = await fetchArtifact(artifact);
          if (!bytes) {
            continue;
          }
          const digest = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
          if (digest !== artifact.sha256) {
            fail(`${label}: hashes to ${digest}, but the index lists ${artifact.sha256}`);
            continue;
          }
          await verifySignature(label, bytes, artifact, workDir);
        }
      }
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function indexName(argv: string[]): string {
  const at = argv.indexOf("--index");
  if (at === -1) {
    return "registry.json";
  }
  const value = argv[at + 1];
  if (!value || !INDEX_FILES.includes(value)) {
    console.error(`--index must be one of: ${INDEX_FILES.join(", ")}`);
    process.exit(1);
  }
  return value;
}

const offline = process.argv.includes("--offline");
const indexFile = indexName(process.argv.slice(2));
const index = (await Bun.file(join(ROOT, indexFile)).json()) as Index;

await validateSchema(index);
validateShape(index);
if (!offline) {
  await validateArtifacts(index);
}

if (problems.length > 0) {
  console.error(`${indexFile} is not valid:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}

const count = index.plugins.length;
console.log(`${indexFile} is valid: ${count} plugin${count === 1 ? "" : "s"} listed`);
