简体中文 | [繁體中文](docs/readme/README.zh-Hant.md) | [English](docs/readme/README.en.md) | [日本語](docs/readme/README.ja.md) | [한국어](docs/readme/README.ko.md) | [Español](docs/readme/README.es.md) | [Русский](docs/readme/README.ru.md) | [Português](docs/readme/README.pt.md) | [Deutsch](docs/readme/README.de.md) | [Français](docs/readme/README.fr.md)

# World Clock Timezone Map Wallpaper

一款为 Wallpaper Engine 制作的世界时钟动态壁纸，在墨卡托世界地图上实时显示城市时间、昼夜状态与晨昏线。

![World Clock Timezone Map Wallpaper 演示](assets/world-map-timezone-map-preview.gif)

## 实现功能

- 实时世界时钟与晨昏线
- IANA 时区与夏令时支持
- 当前城市、预设城市与 JSON 自定义城市
- 大西洋、太平洋两种地图布局
- 10 种界面语言

## 安装

[Steam 创意工坊](https://steamcommunity.com/sharedfiles/filedetails/?id=3747734053)

## 使用方法

IANA 城市列表用于选择手动填写的时区。要显示的城市不必出现在列表中；如果没有对应条目，请选择同一时区的 IANA 城市。本项目使用的 IANA 版本为 2026b。

IANA 城市列表：[IANA 城市列表](https://data.iana.org/time-zones/tzdb-2026b/zone.tab)

### 设置我的城市

本地城市有三个可选值，全部都可以留空：

| 设置项 | 填写方式 | 留空时 |
| --- | --- | --- |
| 我的时区 | IANA 时区，例如 `Asia/Shanghai` | 从系统时区自动获取 |
| 我的城市 | 要显示的城市名 | 根据时区自动推断 |
| 我的坐标 | `纬度,经度`；南纬和西经使用负数 | 根据时区自动推断 |

IANA 列表没有单独的北京条目，但北京与 `Asia/Shanghai` 使用同一时区。要显示北京，可以填写：

| 设置项 | 值 |
| --- | --- |
| 我的时区 | `Asia/Shanghai` |
| 我的城市 | `北京` |
| 我的坐标 | `39.9042,116.4074` |

### 添加自定义城市

在“自定义城市 JSON（见说明）”中可以输入一个或多个城市对象。项目支持省略数组方括号。

#### 完整填写城市信息

以孟买为例，同时指定时区、名称和坐标：

```json
{"timeZone":"Asia/Kolkata","name":"孟买","lat":19.076,"lon":72.8777}
```

#### 仅填写时区

以都柏林为例，只填写 IANA 时区，城市名和坐标会自动补全：

```json
{"timeZone":"Europe/Dublin"}
```

`timeZone` 必填；`name`、`lat` 和 `lon` 均可省略。

#### 同时添加多个城市

多个城市对象直接用逗号分隔：

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
{"timeZone":"Asia/Kolkata","name":"孟买","lat":19.076,"lon":72.8777},
{"timeZone": "Asia/Bangkok"},
{"timeZone":"Asia/Shanghai","name":"北京","lat":39.9042,"lon":116.4074},

{"timeZone": "America/Sao_Paulo"},
{"timeZone": "America/Lima"},
{"timeZone": "America/Santiago"},

{"timeZone": "Africa/Johannesburg"},
{"timeZone": "Australia/Sydney"},
{"timeZone": "Pacific/Auckland"},
```
