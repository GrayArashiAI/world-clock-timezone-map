import test from "node:test";
import assert from "node:assert/strict";
import {
  WORKSHOP_METADATA_FIELDS,
  mergeWorkshopMetadata
} from "../scripts/publish-metadata-lib.mjs";

test("mergeWorkshopMetadata copies only Wallpaper Engine managed fields", () => {
  const developmentProject = {
    title: "Development title",
    tags: ["Technology"]
  };
  const publishProject = {
    description: "Published description",
    title: "Published title",
    visibility: "public",
    workshopid: "3747734053",
    workshopurl: "steam://url/CommunityFilePage/3747734053"
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
      visibility: "public",
      workshopid: "3747734053",
      workshopurl: "steam://url/CommunityFilePage/3747734053"
    }
  );
});

test("mergeWorkshopMetadata ignores missing and empty publish values", () => {
  const developmentProject = {
    description: "Development description",
    visibility: "friends-only",
    workshopid: "existing"
  };

  assert.deepEqual(
    mergeWorkshopMetadata(developmentProject, {
      description: "",
      visibility: null,
      workshopurl: " "
    }),
    developmentProject
  );
});
