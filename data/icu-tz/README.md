# ICUタイムゾーンデータ

Node内蔵ICUのtzdbは更新が遅れるため、生成時だけこのディレクトリのデータでICUを上書きします。
`scripts/with-tzdata.mjs`が`ICU_TIMEZONE_FILES_DIR`にこのディレクトリを指定して子プロセスを起動します。

壁紙の実行時には使いません。Wallpaper Engineの表示時刻はWallpaper Engine側のtzdbで決まります。
`data/iana/`がオフセットの正本で、こちらはその版に合わせた読み取り用のコンパイル済みデータです。

- 取得元: <https://github.com/unicode-org/icu-data/tree/main/tzdata/icunew>
- 版: tzdata `2026c` / ICUデータ形式`44` / リトルエンディアン(`le`)
- ライセンス: Unicode License v3。全文は[`data/cldr/LICENSE`](../cldr/LICENSE)にあります。

## 更新手順

1. `data/iana/`のIANAファイルを目的の版に差し替え、`version.txt`を更新します。
2. 同じ版が[icunew](https://github.com/unicode-org/icu-data/tree/main/tzdata/icunew)にあるか確認します。
   IANAの公開からICUの反映まで数週間かかることがあります。
3. `icunew/<版>/44/le/`から4ファイルを取得してこのディレクトリに上書きします。

   ```
   metaZones.res  timezoneTypes.res  windowsZones.res  zoneinfo64.res
   ```

4. `npm run generate`を実行します。`process.versions.tz`と`data/iana/version.txt`が
   一致しない場合は`assertRuntimeTzdb`が失敗するので、版ずれはそこで検出できます。

ICU側の版がIANAより古い場合でも、採用都市のオフセットに差が出ないなら
そのまま使えます。差が出ないことは生成結果の差分で確認してください。
