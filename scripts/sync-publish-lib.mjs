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
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep
} from "node:path";
import { mergeWorkshopMetadata } from "./publish-metadata-lib.mjs";

export const PUBLISH_REQUIRED_FILES = Object.freeze([
  "index.html",
  "project.json",
  "preview.jpg"
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

function comparisonPath(path) {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function containsPath(parentPath, childPath) {
  const relation = relative(parentPath, childPath);
  return Boolean(
    relation
    && relation !== ".."
    && !relation.startsWith(`..${sep}`)
    && !isAbsolute(relation)
  );
}

function appendUnique(files, relativePath) {
  if (!files.includes(relativePath)) {
    files.push(relativePath);
  }
}

function extractHtmlAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  return match ? match[1] ?? match[2] ?? match[3] : "";
}

function normalizeLocalResourcePath(resourcePath) {
  const trimmed = resourcePath.trim();
  const pathWithoutFragment = trimmed.split("#", 1)[0];
  const pathWithoutQuery = pathWithoutFragment.split("?", 1)[0];
  if (!pathWithoutQuery) {
    throw new Error(`Publish resource path is empty: ${resourcePath}`);
  }
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(pathWithoutQuery)
    || pathWithoutQuery.startsWith("//")
    || pathWithoutQuery.startsWith("/")
    || pathWithoutQuery.startsWith("\\")
    || pathWithoutQuery.includes("\\")
  ) {
    throw new Error(`Publish resource must use a relative local path: ${resourcePath}`);
  }

  const normalized = posix.normalize(pathWithoutQuery);
  if (
    normalized === "."
    || normalized === ".."
    || normalized.startsWith("../")
    || posix.isAbsolute(normalized)
  ) {
    throw new Error(`Publish resource must stay inside the project: ${resourcePath}`);
  }
  return normalized;
}

function collectIndexResources(indexHtml) {
  const resources = [];
  const tagPattern = /<(script|link)\b[^>]*>/gi;
  let match;
  while ((match = tagPattern.exec(indexHtml))) {
    const tag = match[0];
    const attribute = match[1].toLowerCase() === "script" ? "src" : "href";
    const resourcePath = extractHtmlAttribute(tag, attribute);
    if (resourcePath) {
      appendUnique(resources, normalizeLocalResourcePath(resourcePath));
    }
  }
  return resources;
}

async function readIndex(sourceRoot) {
  try {
    return await readFile(join(sourceRoot, "index.html"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Missing publish source file: index.html", { cause: error });
    }
    throw error;
  }
}

export async function resolvePublishFiles(sourceRoot) {
  const indexHtml = await readIndex(sourceRoot);
  const files = [];
  appendUnique(files, "index.html");
  for (const relativePath of collectIndexResources(indexHtml)) {
    appendUnique(files, relativePath);
  }
  for (const relativePath of PUBLISH_REQUIRED_FILES) {
    appendUnique(files, relativePath);
  }
  return files;
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

async function validateSourceFiles(sourceRoot, publishFiles) {
  for (const relativePath of publishFiles) {
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
  existingPublishProject,
  publishFiles
}) {
  for (const relativePath of publishFiles) {
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
  const expectedFiles = [...publishFiles].sort();
  if (
    stagedFiles.length !== expectedFiles.length
    || stagedFiles.some((file, index) => file !== expectedFiles[index])
  ) {
    throw new Error("Staged publish file verification failed");
  }
}

async function replacePublishDirectory({
  publishRoot,
  stageRoot,
  renameOperation = rename
}) {
  if (!await pathExists(publishRoot)) {
    await renameOperation(stageRoot, publishRoot);
    return;
  }

  const backupRoot = `${stageRoot}-backup`;
  const existingEntries = [];
  const stagedEntries = [];
  await mkdir(backupRoot, { recursive: true });

  try {
    for (const entry of await readdir(publishRoot)) {
      await renameOperation(join(publishRoot, entry), join(backupRoot, entry));
      existingEntries.push(entry);
    }

    for (const entry of await readdir(stageRoot)) {
      await renameOperation(join(stageRoot, entry), join(publishRoot, entry));
      stagedEntries.push(entry);
    }
  } catch (error) {
    const rollbackErrors = [];

    for (const entry of [...stagedEntries].reverse()) {
      try {
        await renameOperation(join(publishRoot, entry), join(stageRoot, entry));
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    for (const entry of [...existingEntries].reverse()) {
      try {
        await renameOperation(join(backupRoot, entry), join(publishRoot, entry));
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }

    if (rollbackErrors.length) {
      // 復元できなかった旧ファイルを失わないよう、バックアップをそのまま残します。
      throw new AggregateError(
        [error, ...rollbackErrors],
        `Publish directory replacement and rollback failed; backup preserved at ${backupRoot}`
      );
    }
    await rm(backupRoot, { force: true, recursive: true });
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

export async function syncPublish({ sourceRoot, publishRoot, operations = {} }) {
  const resolvedSourceRoot = resolve(sourceRoot);
  const resolvedPublishRoot = resolve(publishRoot);
  const comparedSourceRoot = comparisonPath(resolvedSourceRoot);
  const comparedPublishRoot = comparisonPath(resolvedPublishRoot);
  if (comparedSourceRoot === comparedPublishRoot) {
    throw new Error("Development and publish directories must be different");
  }
  if (
    containsPath(comparedSourceRoot, comparedPublishRoot)
    || containsPath(comparedPublishRoot, comparedSourceRoot)
  ) {
    throw new Error("Development and publish directories must not overlap");
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
  const publishFiles = await resolvePublishFiles(resolvedSourceRoot);
  await validateSourceFiles(resolvedSourceRoot, publishFiles);

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
      existingPublishProject: existingProjectResult.project,
      publishFiles
    });
    await replacePublishDirectory({
      publishRoot: resolvedPublishRoot,
      stageRoot,
      renameOperation: operations.rename || rename
    });
  } catch (error) {
    if (await pathExists(stageRoot)) {
      await rm(stageRoot, { force: true, recursive: true });
    }
    throw error;
  }

  return {
    destination: resolvedPublishRoot,
    files: [...publishFiles]
  };
}
