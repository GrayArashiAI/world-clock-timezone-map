import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import {
  PUBLISH_FILES,
  syncPublish
} from "../scripts/sync-publish-lib.mjs";

async function createFixtureRoot(t) {
  const root = await mkdtemp(join(tmpdir(), "world-clock-publish-test-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

async function createSource(root, omittedFile = "") {
  for (const relativePath of PUBLISH_FILES) {
    if (relativePath === omittedFile) {
      continue;
    }

    const target = join(root, relativePath);
    await mkdir(dirname(target), { recursive: true });
    if (relativePath === "project.json") {
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

  await mkdir(join(root, "tests"), { recursive: true });
  await writeFile(join(root, "tests", "development.test.mjs"), "development only\n");
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

test("syncPublish replaces the publish directory with only runtime files", async (t) => {
  const root = await createFixtureRoot(t);
  const sourceRoot = join(root, "source");
  const publishRoot = join(root, "publish");
  await createSource(sourceRoot);
  await mkdir(join(publishRoot, "tests"), { recursive: true });
  await writeFile(join(publishRoot, "tests", "old.test.mjs"), "old development file\n");
  await writeFile(join(publishRoot, "project.json"), `${JSON.stringify({
    description: "Published description",
    title: "Published title",
    visibility: "public",
    workshopid: "123456789",
    workshopurl: "steam://url/CommunityFilePage/123456789"
  })}\n`);

  const result = await syncPublish({ sourceRoot, publishRoot });

  assert.deepEqual(await listRelativeFiles(publishRoot), [...PUBLISH_FILES].sort());
  assert.deepEqual(result.files, [...PUBLISH_FILES]);
  const publishedProject = JSON.parse(await readFile(join(publishRoot, "project.json"), "utf8"));
  assert.equal(publishedProject.description, "Published description");
  assert.equal(publishedProject.visibility, "public");
  assert.equal(publishedProject.workshopid, "123456789");
  assert.equal(publishedProject.workshopurl, "steam://url/CommunityFilePage/123456789");
  assert.equal(publishedProject.title, "Development title");
  await assert.rejects(stat(join(publishRoot, "tests", "old.test.mjs")), { code: "ENOENT" });
});

test("syncPublish leaves the publish directory unchanged when its project JSON is invalid", async (t) => {
  const root = await createFixtureRoot(t);
  const sourceRoot = join(root, "source");
  const publishRoot = join(root, "publish");
  await createSource(sourceRoot);
  await mkdir(publishRoot, { recursive: true });
  await writeFile(join(publishRoot, "project.json"), "{ invalid json");
  await writeFile(join(publishRoot, "sentinel.txt"), "keep me\n");

  await assert.rejects(
    syncPublish({ sourceRoot, publishRoot }),
    /Cannot parse existing publish project/
  );

  assert.equal(await readFile(join(publishRoot, "project.json"), "utf8"), "{ invalid json");
  assert.equal(await readFile(join(publishRoot, "sentinel.txt"), "utf8"), "keep me\n");
});

test("syncPublish leaves the publish directory unchanged when a source file is missing", async (t) => {
  const root = await createFixtureRoot(t);
  const sourceRoot = join(root, "source");
  const publishRoot = join(root, "publish");
  await createSource(sourceRoot, "src/main.js");
  await mkdir(publishRoot, { recursive: true });
  const existingProject = `${JSON.stringify({
    title: "Published title",
    workshopid: "123456789"
  })}\n`;
  await writeFile(join(publishRoot, "project.json"), existingProject);
  await writeFile(join(publishRoot, "sentinel.txt"), "keep me\n");

  await assert.rejects(
    syncPublish({ sourceRoot, publishRoot }),
    /Missing publish source file: src\/main\.js/
  );

  assert.equal(await readFile(join(publishRoot, "project.json"), "utf8"), existingProject);
  assert.equal(await readFile(join(publishRoot, "sentinel.txt"), "utf8"), "keep me\n");
});

test("syncPublish rejects identical development and publish paths", async (t) => {
  const root = await createFixtureRoot(t);
  await createSource(root);

  await assert.rejects(
    syncPublish({ sourceRoot: root, publishRoot: root }),
    /Development and publish directories must be different/
  );
});

test("syncPublish updates files while another process uses the publish root", async (t) => {
  const root = await createFixtureRoot(t);
  const sourceRoot = join(root, "source");
  const publishRoot = join(root, "publish");
  await createSource(sourceRoot);
  await mkdir(publishRoot, { recursive: true });
  await writeFile(join(publishRoot, "project.json"), `${JSON.stringify({
    title: "Published title",
    workshopid: "123456789"
  })}\n`);
  await writeFile(join(publishRoot, "old-development-file.txt"), "remove me\n");
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

  assert.deepEqual(await listRelativeFiles(publishRoot), [...PUBLISH_FILES].sort());
  const publishedProject = JSON.parse(await readFile(join(publishRoot, "project.json"), "utf8"));
  assert.equal(publishedProject.workshopid, "123456789");
});
