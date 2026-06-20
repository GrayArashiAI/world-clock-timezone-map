export const WORKSHOP_METADATA_FIELDS = Object.freeze([
  "description",
  "visibility",
  "workshopid",
  "workshopurl"
]);

function hasMetadataValue(value) {
  if (typeof value === "string") {
    return Boolean(value.trim());
  }
  return typeof value === "number" && Number.isFinite(value);
}

export function mergeWorkshopMetadata(developmentProject, publishProject) {
  const merged = { ...developmentProject };
  for (const field of WORKSHOP_METADATA_FIELDS) {
    if (hasMetadataValue(publishProject?.[field])) {
      merged[field] = publishProject[field];
    }
  }
  return merged;
}
