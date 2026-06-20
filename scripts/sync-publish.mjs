import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { syncPublish } from "./sync-publish-lib.mjs";

const developmentRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const publishRoot = resolve(developmentRoot, "..", "world_clock_timezone_map");
const result = await syncPublish({
  sourceRoot: developmentRoot,
  publishRoot
});

console.log(`Published ${result.files.length} files to ${result.destination}`);
