import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import {
  resolvePublishFiles,
  syncPublish
} from "../scripts/sync-publish-lib.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultRuntimeResources = Object.freeze([
  "styles.css",
  "src/map-data.js",
  "src/city-presets.js",
  "src/wallpaper-core.js",
  "src/label-layout.js",
  "src/main.js"
]);

async function createFixtureRoot(t) {
  const root = await mkdtemp(join(tmpdir(), "world-clock-publish-test-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

function fixtureIndex(resources = defaultRuntimeResources) {
  const tags = resources.map((relativePath) => {
    if (relativePath.endsWith(".css")) {
      return `<link rel="stylesheet" href="${relativePath}">`;
    }
    return `<script src="${relativePath}"></script>`;
  });
  return `<!doctype html>\n${tags.join("\n")}\n`;
}

async function createSource(root, omittedFile = "", resources = defaultRuntimeResources) {
  const fixtureFiles = [
    "index.html",
    "project.json",
    "preview.jpg",
    ...resources
  ].filter((relativePath, index, files) => files.indexOf(relativePath) === index);

  for (const relativePath of fixtureFiles) {
    if (relativePath === omittedFile) {
      continue;
    }
    const target = join(root, relativePath);
    await mkdir(dirname(target), { recursive: true });
    if (relativePath === "index.html") {
      await writeFile(target, fixtureIndex(resources));
    } else if (relativePath === "project.json") {
      await writeFile(target, `${JSON.stringify({
        file: "index.html",
        preview: "preview.jpg",
        title: "Development title",
        type: "web"
      }, null, "\t")}\n`);
    } else if (relativePath === "preview.jpg") {
      await writeFile(target, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    } else {
      await writeFile(target, `development:${relativePath}\n`);
    }
  }
}

async function listRelativeFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
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

test("publish file list includes every local script loaded by index.html", async () => {
  const indexHtml = await readFile(join(projectRoot, "index.html"), "utf8");
  const publishFiles = await resolvePublishFiles(projectRoot);
  const scriptPaths = [...indexHtml.matchAll(/<script\s+src="([^"]+)"><\/script>/g)]
    .map((match) => match[1]);

  assert.deepEqual(
    scriptPaths.filter((scriptPath) => scriptPath.startsWith("src/")),
    publishFiles.filter((file) => file.startsWith("src/"))
  );
});

test("syncPublish replaces the destination with runtime files and preserves Workshop metadata", async (t) => {
  const root = await createFixtureRoot(t);
  const sourceRoot = join(root, "source");
  const publishRoot = join(root, "publish");
  await createSource(sourceRoot);
  await mkdir(join(publishRoot, "tests"), { recursive: true });
  await writeFile(join(publishRoot, "tests", "old.test.mjs"), "old\n");
  await writeFile(join(publishRoot, "project.json"), `${JSON.stringify({
    description: "Published description",
    title: "Published title",
    visibility: "public",
    workshopid: "123456789",
    workshopurl: "steam://url/CommunityFilePage/123456789"
  })}\n`);

  const result = await syncPublish({ sourceRoot, publishRoot });
  const publishedProject = JSON.parse(await readFile(join(publishRoot, "project.json"), "utf8"));
  const expectedFiles = await resolvePublishFiles(sourceRoot);

  assert.deepEqual(await listRelativeFiles(publishRoot), [...expectedFiles].sort());
  assert.deepEqual(result.files, expectedFiles);
  assert.deepEqual(
    {
      title: publishedProject.title,
      description: publishedProject.description,
      workshopid: publishedProject.workshopid
    },
    {
      title: "Development title",
      description: "Published description",
      workshopid: "123456789"
    }
  );
});

test("syncPublish discovers local runtime files from index.html", async (t) => {
  const root = await createFixtureRoot(t);
  const sourceRoot = join(root, "source");
  const publishRoot = join(root, "publish");
  await createSource(sourceRoot, "", [
    "styles.css",
    "src/map-data.js",
    "src/extra-runtime.js"
  ]);

  const result = await syncPublish({ sourceRoot, publishRoot });

  assert.equal(
    await readFile(join(publishRoot, "src", "extra-runtime.js"), "utf8"),
    "development:src/extra-runtime.js\n"
  );
  assert.equal(result.files.includes("src/extra-runtime.js"), true);
});

test("syncPublish rejects unsafe index resources before touching the destination", async (t) => {
  const root = await createFixtureRoot(t);
  const cases = [
    ["absolute", "/src/main.js"],
    ["parent", "../src/main.js"],
    ["windows", "src\\main.js"],
    ["remote", "https://example.com/runtime.js"]
  ];

  for (const [name, resourcePath] of cases) {
    const sourceRoot = join(root, `source-${name}`);
    const publishRoot = join(root, `publish-${name}`);
    await createSource(sourceRoot, "", ["styles.css"]);
    await writeFile(
      join(sourceRoot, "index.html"),
      `<!doctype html>\n<script src="${resourcePath}"></script>\n`
    );
    await mkdir(publishRoot, { recursive: true });
    await writeFile(join(publishRoot, "sentinel.txt"), name);

    await assert.rejects(
      syncPublish({ sourceRoot, publishRoot }),
      /relative local path|stay inside the project/
    );
    assert.equal(await readFile(join(publishRoot, "sentinel.txt"), "utf8"), name);
  }
});

test("syncPublish preflight failures leave existing destinations unchanged", async (t) => {
  const root = await createFixtureRoot(t);
  const cases = [
    {
      name: "invalid existing project",
      omittedFile: "",
      projectText: "{ invalid json",
      expectedError: /Cannot parse existing publish project/
    },
    {
      name: "missing source file",
      omittedFile: "src/main.js",
      projectText: '{"title":"Published title"}\n',
      expectedError: /Missing publish source file: src\/main\.js/
    }
  ];

  for (const [index, scenario] of cases.entries()) {
    const sourceRoot = join(root, `source-${index}`);
    const publishRoot = join(root, `publish-${index}`);
    await createSource(sourceRoot, scenario.omittedFile);
    await mkdir(publishRoot, { recursive: true });
    await writeFile(join(publishRoot, "project.json"), scenario.projectText);
    await writeFile(join(publishRoot, "sentinel.txt"), scenario.name);

    await assert.rejects(syncPublish({ sourceRoot, publishRoot }), scenario.expectedError);
    assert.equal(await readFile(join(publishRoot, "project.json"), "utf8"), scenario.projectText);
    assert.equal(await readFile(join(publishRoot, "sentinel.txt"), "utf8"), scenario.name);
  }
});

test("syncPublish rejects identical or nested development and publish paths", async (t) => {
  const root = await createFixtureRoot(t);
  const sourceRoot = join(root, "source");
  await createSource(sourceRoot);
  await writeFile(join(root, "project.json"), "{}\n");

  for (const [source, destination] of [
    [sourceRoot, sourceRoot],
    [sourceRoot, root],
    [sourceRoot, join(sourceRoot, "publish")]
  ]) {
    await assert.rejects(
      syncPublish({ sourceRoot: source, publishRoot: destination }),
      /must be different|must not overlap/
    );
  }
  assert.equal((await stat(join(sourceRoot, "src", "main.js"))).isFile(), true);
});

test("syncPublish works while another process uses the publish directory", async (t) => {
  const root = await createFixtureRoot(t);
  const sourceRoot = join(root, "source");
  const publishRoot = join(root, "publish");
  await createSource(sourceRoot);
  await mkdir(publishRoot, { recursive: true });
  await writeFile(join(publishRoot, "project.json"), '{"workshopid":"123456789"}\n');
  const expectedFiles = await resolvePublishFiles(sourceRoot);
  const directoryUser = spawn(
    process.execPath,
    ["-e", "process.stdout.write('ready'); setTimeout(() => {}, 30000);"],
    {
      cwd: publishRoot,
      stdio: ["ignore", "pipe", "inherit"]
    }
  );
  await once(directoryUser.stdout, "data");

  try {
    await syncPublish({ sourceRoot, publishRoot });
  } finally {
    directoryUser.kill();
    await once(directoryUser, "exit");
  }

  assert.deepEqual(await listRelativeFiles(publishRoot), [...expectedFiles].sort());
});

test("syncPublish preserves the backup when rollback is incomplete", async (t) => {
  const root = await createFixtureRoot(t);
  const sourceRoot = join(root, "source");
  const publishRoot = join(root, "publish");
  await createSource(sourceRoot);
  await mkdir(publishRoot, { recursive: true });
  await writeFile(join(publishRoot, "project.json"), '{"workshopid":"123456789"}\n');
  await writeFile(join(publishRoot, "sentinel.txt"), "keep me\n");

  const renameWithFailures = async (source, destination) => {
    const sourceParent = dirname(source);
    const destinationParent = dirname(destination);
    if (
      destinationParent === publishRoot
      && sourceParent !== publishRoot
      && !sourceParent.endsWith("-backup")
    ) {
      throw new Error("injected publish move failure");
    }
    if (
      destinationParent === publishRoot
      && sourceParent.endsWith("-backup")
      && source.endsWith(`${sep}sentinel.txt`)
    ) {
      throw new Error("injected rollback failure");
    }
    await rename(source, destination);
  };

  await assert.rejects(
    syncPublish({
      sourceRoot,
      publishRoot,
      operations: { rename: renameWithFailures }
    }),
    /rollback failed/
  );

  const backupEntries = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.endsWith("-backup"));
  assert.equal(backupEntries.length, 1);
  assert.equal(
    await readFile(join(root, backupEntries[0].name, "sentinel.txt"), "utf8"),
    "keep me\n"
  );
});
