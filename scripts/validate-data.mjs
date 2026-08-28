import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataset = JSON.parse(await readFile(path.join(projectRoot, "data", "sample-data.json"), "utf8"));
const mechanisms = new Set(["token", "component", "component-variant", "composition"]);
const readinessStates = new Set([
  "ready-to-test",
  "needs-token-configuration",
  "needs-component-refactoring",
  "needs-provisional-composition",
  "out-of-scope"
]);
const errors = [];
const ids = new Set();

if (dataset.source?.isSample !== true) errors.push("Starter dataset must remain explicitly marked as sample data.");
for (const [index, record] of dataset.records.entries()) {
  const row = index + 1;
  if (!record.id) errors.push(`Row ${row}: missing id.`);
  if (ids.has(record.id)) errors.push(`Row ${row}: duplicate id ${record.id}.`);
  ids.add(record.id);
  if (!record.vdlChange) errors.push(`Row ${row}: missing vdlChange.`);
  if (!mechanisms.has(record.changeMechanism)) errors.push(`Row ${row}: invalid mechanism.`);
  if (!readinessStates.has(record.readiness)) errors.push(`Row ${row}: invalid readiness.`);
  if (!record.owner?.name) errors.push(`Row ${row}: missing owner.`);
  if (!record.nextAction?.label) errors.push(`Row ${row}: missing next action.`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${dataset.records.length} explicitly labelled sample records.`);
}
