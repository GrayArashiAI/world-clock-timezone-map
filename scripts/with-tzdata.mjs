// Node内蔵ICUのtzdbは更新が遅れるため、data/icu-tzのタイムゾーンデータで上書きして子プロセスを起動します。
// ICUはプロセス起動時にタイムゾーンを初期化するので、実行中に環境変数を設定しても反映されません。
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const result = spawnSync(process.execPath, process.argv.slice(2), {
  stdio: "inherit",
  env: { ...process.env, ICU_TIMEZONE_FILES_DIR: join(root, "data", "icu-tz") }
});

if (result.error) {
  throw result.error;
}
if (result.signal) {
  throw new Error(`Child process terminated by signal: ${result.signal}`);
}

process.exit(result.status ?? 1);
