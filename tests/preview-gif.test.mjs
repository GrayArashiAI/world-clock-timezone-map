import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageConfig = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("preview GIF generation remains manually triggered outside the build", () => {
  const previewCommand = packageConfig.scripts["preview:gif"];

  assert.equal(typeof previewCommand, "string");
  assert.equal(previewCommand.trim().length > 0, true);
  assert.equal(packageConfig.scripts.build.includes("preview:gif"), false);
});
