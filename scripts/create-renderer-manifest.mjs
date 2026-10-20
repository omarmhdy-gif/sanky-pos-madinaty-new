import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("out");
const manifestPath = path.join(root, "renderer-manifest.json");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolutePath));
    else if (entry.isFile() && absolutePath !== manifestPath) files.push(absolutePath);
  }
  return files;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

const entries = (await walk(root)).sort((a, b) => a.localeCompare(b));
if (!entries.some((filePath) => path.relative(root, filePath) === path.join("pos", "index.html"))) {
  throw new Error("The static export does not contain the POS entry page.");
}

const files = [];
for (const filePath of entries) {
  const relativePath = path.relative(root, filePath).split(path.sep).join("/");
  const fileStat = await stat(filePath);
  files.push({ path: relativePath, size: fileStat.size, sha256: await hashFile(filePath) });
}

const releaseHash = createHash("sha256").update(JSON.stringify(files)).digest("hex");
const manifest = {
  schema: 1,
  version: releaseHash,
  generatedAt: new Date().toISOString(),
  files,
};
await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
console.log(`Created renderer manifest ${manifest.version.slice(0, 16)} with ${files.length} files.`);
