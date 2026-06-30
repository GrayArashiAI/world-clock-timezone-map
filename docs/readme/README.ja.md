[简体中文](../../README.md) | [繁體中文](README.zh-Hant.md) | [English](README.en.md) | 日本語 | [한국어](README.ko.md) | [Español](README.es.md) | [Русский](README.ru.md) | [Português](README.pt.md) | [Deutsch](README.de.md) | [Français](README.fr.md)

# World Clock Timezone Map Wallpaper

メルカトル世界地図上に都市の現地時刻、昼夜、リアルタイムの昼夜境界線を表示する、Wallpaper Engine 向けの世界時計壁紙です。

![World Clock Timezone Map Wallpaper デモ](../../assets/world-map-timezone-map-preview.gif)

## 実装機能

- リアルタイムの世界時計と昼夜境界線
- IANA タイムゾーンと夏時間に対応
- 現在地、プリセット、JSON カスタム都市
- 大西洋中心と太平洋中心の地図レイアウト
- 10 言語対応

## インストール

[Steam ワークショップ](https://steamcommunity.com/sharedfiles/filedetails/?id=3747734053)

## 使用方法

IANAの都市一覧は、手動で入力するタイムゾーンを選ぶためのものです。表示したい都市がこの一覧に載っている必要はありません。個別の IANA 項目がない場合は、同じタイムゾーンの IANA 都市を選んでください。本プロジェクトで使用している IANA のバージョンは 2026b です。

IANAの都市一覧：[IANAの都市一覧](https://data.iana.org/time-zones/tzdb-2026b/zone.tab)

### 現在地の都市を設定

現在地の都市には 3 つの任意項目があり、すべて空欄にできます。

| 設定項目 | 入力方法 | 空欄の場合 |
| --- | --- | --- |
| 現在地のタイムゾーン | `Asia/Shanghai` などの IANA タイムゾーン | システムのタイムゾーンから自動取得 |
| 現在地の都市名 | 表示する都市名 | タイムゾーンから自動推定 |
| 現在地の座標 | `緯度,経度`。南緯と西経には負数を使います | タイムゾーンから自動推定 |

IANA には北京専用の項目がありません。北京は `Asia/Shanghai` と同じタイムゾーンなので、北京を表示する場合は次の値を入力します。

| 設定項目 | 値 |
| --- | --- |
| 現在地のタイムゾーン | `Asia/Shanghai` |
| 現在地の都市名 | `北京` |
| 現在地の座標 | `39.9042,116.4074` |

### カスタム都市を追加

「更に追加(ワークショップ説明参照)」には 1 つ以上の都市オブジェクトを入力できます。配列の角括弧は省略できます。

#### 都市情報をすべて指定

ムンバイを例に、タイムゾーン、名前、座標を指定します。

```json
{"timeZone":"Asia/Kolkata","name":"ムンバイ","lat":19.076,"lon":72.8777}
```

#### タイムゾーンのみ指定

ダブリンを例に、IANA タイムゾーンだけを指定します。都市名と座標は自動的に補完されます。

```json
{"timeZone":"Europe/Dublin"}
```

`timeZone` は必須です。`name`、`lat`、`lon` は省略できます。

#### 複数の都市を追加

都市オブジェクトをカンマで区切ります。

```json
{"timeZone": "Pacific/Honolulu"},
{"timeZone": "America/Anchorage"},
{"timeZone": "America/Los_Angeles"},
{"timeZone": "America/Mexico_City"},
{"timeZone": "America/New_York"},

{"timeZone": "Europe/London"},
{"timeZone": "Europe/Paris"},
{"timeZone": "Europe/Istanbul"},
{"timeZone": "Europe/Moscow"},
{"timeZone": "Asia/Dubai"},
{"timeZone":"Asia/Kolkata","name":"ムンバイ","lat":19.076,"lon":72.8777},
{"timeZone": "Asia/Bangkok"},
{"timeZone":"Asia/Shanghai","name":"北京","lat":39.9042,"lon":116.4074},

{"timeZone": "America/Sao_Paulo"},
{"timeZone": "America/Lima"},
{"timeZone": "America/Santiago"},

{"timeZone": "Africa/Johannesburg"},
{"timeZone": "Australia/Sydney"},
{"timeZone": "Pacific/Auckland"},
```
