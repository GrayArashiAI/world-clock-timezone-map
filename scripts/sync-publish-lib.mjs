import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import {
  basename,
  dirname,
  join,
  relative,
  resolve,
  sep
} from "node:path";
import { mergeWorkshopMetadata } from "./publish-metadata-lib.mjs";

export const PUBLISH_FILES = Object.freeze([
  "index.html",
  "styles.css",
  "project.json",
  "preview.jpg",
  "src/map-data.js",
  "src/city-presets.js",
  "src/wallpaper-core.js",
  "src/main.js"
]);

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readProject(path, label, allowMissing = false) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") {
      return { project: null, source: null };
    }
    throw error;
  }

  try {
    return {
      project: JSON.parse(source),
      source
    };
  } catch (error) {
    throw new Error(`Cannot parse ${label} project: ${path}`, { cause: error });
  }
}

async function validateSourceFiles(sourceRoot) {
  for (const relativePath of PUBLISH_FILES) {
    const sourcePath = join(sourceRoot, relativePath);
    let metadata;
    try {
      metadata = await stat(sourcePath);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(`Missing publish source file: ${relativePath}`, { cause: error });
      }
      throw error;
    }
    if (!metadata.isFile()) {
      throw new Error(`Publish source is not a file: ${relativePath}`);
    }
  }
}

async function listRelativeFiles(root) {
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else {
        files.push(relative(root, absolutePath).split(sep).join("/"));
      }
    }
  }

  await visit(root);
  return files.sort();
}

async function stagePublishFiles({
  sourceRoot,
  stageRoot,
  sourceProject,
  sourceProjectText,
  existingPublishProject
}) {
  for (const relativePath of PUBLISH_FILES) {
    const sourcePath = join(sourceRoot, relativePath);
    const targetPath = join(stageRoot, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });

    if (relativePath === "project.json" && existingPublishProject) {
      await writeFile(
        targetPath,
        `${JSON.stringify(
          mergeWorkshopMetadata(sourceProject, existingPublishProject),
          null,
          "\t"
        )}\n`,
        "utf8"
      );
    } else if (relativePath === "project.json") {
      await writeFile(targetPath, sourceProjectText, "utf8");
    } else {
      await copyFile(sourcePath, targetPath);
    }
  }

  const stagedFiles = await listRelativeFiles(stageRoot);
  const expectedFiles = [...PUBLISH_FILES].sort();
  if (
    stagedFiles.length !== expectedFiles.length
    || stagedFiles.some((file, index) => file !== expectedFiles[index])
  ) {
    throw new Error("Staged publish file verification failed");
  }
}

async function replacePublishDirectory({ publishRoot, stageRoot }) {
  if (!await pathExists(publishRoot)) {
    await rename(stageRoot, publishRoot);
    return;
  }

  const backupRoot = `${stageRoot}-backup`;
  const existingEntries = [];
  const stagedEntries = [];
  await mkdir(backupRoot, { recursive: true });

  try {
    for (const entry of await readdir(publishRoot)) {
      await rename(join(publishRoot, entry), join(backupRoot, entry));
      existingEntries.push(entry);
    }

    for (const entry of await readdir(stageRoot)) {
      await rename(join(stageRoot, entry), join(publishRoot, entry));
      stagedEntries.push(entry);
    }
  } catch (error) {
    const rollbackErrors = [];

    for (const entry of [...stagedEntries].reverse()) {
      try {
        await rename(join(publishRoot, entry), join(stageRoot, entry));
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    for (const entry of [...existingEntries].reverse()) {
      try {
        await rename(join(backupRoot, entry), join(publishRoot, entry));
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }

    await rm(backupRoot, { force: true, recursive: true });
    if (rollbackErrors.length) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Publish directory replacement and rollback failed"
      );
    }
    throw error;
  }

  await rm(stageRoot, { force: true, recursive: true });
  await rm(backupRoot, {
    force: true,
    maxRetries: 5,
    recursive: true,
    retryDelay: 100
  });
}

export async function syncPublish({ sourceRoot, publishRoot }) {
  const resolvedSourceRoot = resolve(sourceRoot);
  const resolvedPublishRoot = resolve(publishRoot);
  if (resolvedSourceRoot.toLowerCase() === resolvedPublishRoot.toLowerCase()) {
    throw new Error("Development and publish directories must be different");
  }

  const sourceProjectResult = await readProject(
    join(resolvedSourceRoot, "project.json"),
    "development"
  );
  const existingProjectResult = await readProject(
    join(resolvedPublishRoot, "project.json"),
    "existing publish",
    true
  );
  await validateSourceFiles(resolvedSourceRoot);

  const publishParent = dirname(resolvedPublishRoot);
  await mkdir(publishParent, { recursive: true });
  const stageRoot = await mkdtemp(join(
    publishParent,
    `.${basename(resolvedPublishRoot)}-publish-`
  ));

  try {
    await stagePublishFiles({
      sourceRoot: resolvedSourceRoot,
      stageRoot,
      sourceProject: sourceProjectResult.project,
      sourceProjectText: sourceProjectResult.source,
      existingPublishProject: existingProjectResult.project
    });
    await replacePublishDirectory({
      publishRoot: resolvedPublishRoot,
      stageRoot
    });
  } catch (error) {
    if (await pathExists(stageRoot)) {
      await rm(stageRoot, { force: true, recursive: true });
    }
    throw error;
  }

  return {
    destination: resolvedPublishRoot,
    files: [...PUBLISH_FILES]
  };
}
