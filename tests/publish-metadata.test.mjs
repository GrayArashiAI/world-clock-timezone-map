import test from "node:test";
import assert from "node:assert/strict";
import {
  WORKSHOP_METADATA_FIELDS,
  mergeWorkshopMetadata
} from "../scripts/publish-metadata-lib.mjs";

test("mergeWorkshopMetadata copies only non-empty Wallpaper Engine managed fields", () => {
  const developmentProject = {
    description: "Development description",
    tags: ["Technology"],
    title: "Development title",
    visibility: "friends-only",
    workshopid: "existing"
  };
  const publishProject = {
    description: "Published description",
    title: "Published title",
    visibility: "",
    workshopid: "3747734053",
    workshopurl: " "
  };

  assert.deepEqual(WORKSHOP_METADATA_FIELDS, [
    "description",
    "visibility",
    "workshopid",
    "workshopurl"
  ]);
  assert.deepEqual(
    mergeWorkshopMetadata(developmentProject, publishProject),
    {
      description: "Published description",
      tags: ["Technology"],
      title: "Development title",
      visibility: "friends-only",
      workshopid: "3747734053"
    }
  );
});
