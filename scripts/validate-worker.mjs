import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import worker from "../server/worker.js";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const html = await readFile(path.join(projectRoot, "index.html"), "utf8");
const environment = {
  ASSETS: {
    fetch: async () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })
  }
};
const response = await worker.fetch(new Request("https://vdl.example.test/"), environment);
const output = await response.text();

if (output.includes("__SITE_ORIGIN__")) throw new Error("Worker did not resolve the social metadata origin.");
if (!output.includes("https://vdl.example.test/og.png")) throw new Error("Worker generated an incorrect social image URL.");
console.log("Validated trusted-origin social metadata rewriting.");
