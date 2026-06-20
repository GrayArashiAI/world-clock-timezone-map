import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WORKSHOP_METADATA_FIELDS,
  mergeWorkshopMetadata
} from "./publish-metadata-lib.mjs";

const developmentRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const publishRoot = resolve(developmentRoot, "..", "world_clock_timezone_map");
const developmentProjectPath = join(developmentRoot, "project.json");
const publishProjectPath = join(publishRoot, "project.json");

const developmentProject = JSON.parse(await readFile(developmentProjectPath, "utf8"));
const publishProject = JSON.parse(await readFile(publishProjectPath, "utf8"));
const mergedProject = mergeWorkshopMetadata(developmentProject, publishProject);
const copiedFields = WORKSHOP_METADATA_FIELDS.filter(
  (field) => mergedProject[field] === publishProject[field]
);

if (!copiedFields.includes("workshopid")) {
  throw new Error(`Published Workshop ID is missing: ${publishProjectPath}`);
}

await writeFile(
  developmentProjectPath,
  `${JSON.stringify(mergedProject, null, "\t")}\n`,
  "utf8"
);

console.log(`Pulled Workshop metadata: ${copiedFields.join(", ")}`);
