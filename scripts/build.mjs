import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputRoot = path.join(projectRoot, "dist");
const clientRoot = path.join(outputRoot, "client");
const serverRoot = path.join(outputRoot, "server");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(clientRoot, { recursive: true });
await mkdir(serverRoot, { recursive: true });

for (const file of ["index.html", "styles.css", "app.js"]) {
  await cp(path.join(projectRoot, file), path.join(clientRoot, file));
}
await cp(path.join(projectRoot, "data"), path.join(clientRoot, "data"), { recursive: true });
await cp(path.join(projectRoot, "public"), clientRoot, { recursive: true });
await cp(path.join(projectRoot, "server", "worker.js"), path.join(serverRoot, "index.js"));

console.log("Built dashboard into dist/client with a Cloudflare-compatible worker entrypoint.");
