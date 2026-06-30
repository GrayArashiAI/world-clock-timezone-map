[简体中文](../../README.md) | 繁體中文 | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Русский](README.ru.md) | [Português](README.pt.md) | [Deutsch](README.de.md) | [Français](README.fr.md)

# World Clock Timezone Map Wallpaper

一款為 Wallpaper Engine 製作的世界時鐘動態桌布，在麥卡托世界地圖上即時顯示城市時間、晝夜狀態與晨昏線。

![World Clock Timezone Map Wallpaper 示範](../../assets/world-map-timezone-map-preview.gif)

## 實現功能

- 即時世界時鐘與晨昏線
- 支援 IANA 時區與日光節約時間
- 目前城市、預設城市與 JSON 自訂城市
- 大西洋、太平洋兩種地圖配置
- 10 種介面語言

## 安裝

[Steam 工作坊](https://steamcommunity.com/sharedfiles/filedetails/?id=3747734053)

## 使用方法

IANA 城市列表用於選擇手動填寫的時區。要顯示的城市不必出現在列表中；如果沒有對應條目，請選擇同一時區的 IANA 城市。本專案使用的 IANA 版本為 2026b。

IANA 城市列表：[IANA 城市列表](https://data.iana.org/time-zones/tzdb-2026b/zone.tab)

### 設定我的城市

本地城市有三個可選值，全部都可以留空：

| 設定項目 | 填寫方式 | 留空時 |
| --- | --- | --- |
| 我的時區 | IANA 時區，例如 `Asia/Shanghai` | 從系統時區自動取得 |
| 我的城市 | 要顯示的城市名稱 | 根據時區自動推斷 |
| 我的座標 | `緯度,經度`；南緯和西經使用負數 | 根據時區自動推斷 |

IANA 列表沒有獨立的北京條目，但北京與 `Asia/Shanghai` 使用同一時區。若要顯示北京，可以填寫：

| 設定項目 | 值 |
| --- | --- |
| 我的時區 | `Asia/Shanghai` |
| 我的城市 | `北京` |
| 我的座標 | `39.9042,116.4074` |

### 新增自訂城市

在「更多城市(見工坊說明)」中可以輸入一個或多個城市物件。專案支援省略陣列方括號。

#### 完整填寫城市資訊

以孟買為例，同時指定時區、名稱和座標：

```json
{"timeZone":"Asia/Kolkata","name":"孟買","lat":19.076,"lon":72.8777}
```

#### 僅填寫時區

以都柏林為例，只填寫 IANA 時區，城市名稱和座標會自動補齊：

```json
{"timeZone":"Europe/Dublin"}
```

`timeZone` 必填；`name`、`lat` 和 `lon` 均可省略。

#### 同時新增多個城市

多個城市物件直接以逗號分隔：

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
{"timeZone":"Asia/Kolkata","name":"孟買","lat":19.076,"lon":72.8777},
{"timeZone": "Asia/Bangkok"},
{"timeZone":"Asia/Shanghai","name":"北京","lat":39.9042,"lon":116.4074},

{"timeZone": "America/Sao_Paulo"},
{"timeZone": "America/Lima"},
{"timeZone": "America/Santiago"},

{"timeZone": "Africa/Johannesburg"},
{"timeZone": "Australia/Sydney"},
{"timeZone": "Pacific/Auckland"},
```
