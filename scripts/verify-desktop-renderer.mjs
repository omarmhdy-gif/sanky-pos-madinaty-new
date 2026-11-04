import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const rendererRoot = path.resolve(process.argv[2] ?? "release/win-unpacked/resources/out");
const manifestPath = path.join(rendererRoot, "renderer-manifest.json");

function fail(message) {
  console.error(`Desktop renderer verification failed: ${message}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  fail(`renderer manifest missing or invalid at ${manifestPath}`);
}

if (manifest?.schema !== 1 || !Array.isArray(manifest.files) || manifest.files.length === 0) {
  fail("unsupported or empty renderer manifest");
}

for (const file of manifest.files) {
  if (typeof file?.path !== "string" || file.path.startsWith("/") || file.path.includes("\\") || file.path.split("/").some((part) => !part || part === "." || part === "..")) {
    fail("manifest contains an unsafe path");
  }

  const filePath = path.join(rendererRoot, ...file.path.split("/"));
  try {
    const [metadata, contents] = await Promise.all([stat(filePath), readFile(filePath)]);
    const sha256 = createHash("sha256").update(contents).digest("hex");
    if (!metadata.isFile() || metadata.size !== file.size || sha256 !== file.sha256) {
      fail(`size or SHA-256 mismatch for ${file.path}`);
    }
  } catch (error) {
    fail(`missing or unreadable renderer file ${file.path}: ${error.message}`);
  }
}

console.log(`Verified ${manifest.files.length} renderer files (${manifest.version}).`);
