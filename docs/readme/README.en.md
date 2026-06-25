[简体中文](../../README.md) | [繁體中文](README.zh-Hant.md) | English | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Русский](README.ru.md) | [Português](README.pt.md) | [Deutsch](README.de.md)

# World Clock Timezone Map Wallpaper

A Wallpaper Engine world clock that displays local city times, day-night states, and the live solar terminator on a Mercator world map.

![World Clock Timezone Map Wallpaper demo](../../assets/world-map-timezone-map-preview.gif)

## Implemented Features

- Live world clocks and solar terminator
- IANA time zones and daylight-saving time
- Current, preset, and JSON-defined cities
- Atlantic-centered and Pacific-centered layouts
- Nine interface languages

## Installation

[Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3747734053)

## Usage

Manually added time zones must appear in the [IANA city list](https://data.iana.org/time-zones/tzdb-2026b/zone.tab). This project uses IANA version 2026b.

### Set Your City

For Beijing, enter these values in the Wallpaper Engine settings:

| Setting | Value |
| --- | --- |
| My time zone | `Asia/Shanghai` |
| My city | `Beijing` |
| My coordinates | `39.9042,116.4074` |

Coordinates use the `latitude,longitude` format. Use negative values for south and west. IANA has no separate Beijing time zone, so Beijing uses `Asia/Shanghai`.

### Add Custom Cities

“More cities (see Workshop description)” accepts one or more city objects. The surrounding array brackets may be omitted.

#### Specify All City Data

Using Mumbai as an example, specify its time zone, name, and coordinates:

```json
{"timeZone":"Asia/Kolkata","name":"Mumbai","lat":19.076,"lon":72.8777}
```

#### Specify Only a Time Zone

Using Dublin as an example, provide only its IANA time zone. The city name and coordinates are filled automatically:

```json
{"timeZone":"Europe/Dublin"}
```

`timeZone` is required; `name`, `lat`, and `lon` are optional.

#### Add Multiple Cities

Separate city objects with commas:

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
{"timeZone":"Asia/Kolkata","name":"Mumbai","lat":19.076,"lon":72.8777},
{"timeZone": "Asia/Bangkok"},
{"timeZone":"Asia/Shanghai","name":"Beijing","lat":39.9042,"lon":116.4074},

{"timeZone": "America/Sao_Paulo"},
{"timeZone": "America/Lima"},
{"timeZone": "America/Santiago"},

{"timeZone": "Africa/Johannesburg"},
{"timeZone": "Australia/Sydney"},
{"timeZone": "Pacific/Auckland"},
```
