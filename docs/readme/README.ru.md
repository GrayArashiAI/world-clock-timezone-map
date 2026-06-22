[简体中文](../../README.md) | [繁體中文](README.zh-Hant.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | Русский | [Português](README.pt.md) | [Deutsch](README.de.md)

# World Clock Timezone Map Wallpaper

Обои с мировыми часами для Wallpaper Engine, показывающие местное время городов, день и ночь и линию солнечного терминатора на карте мира в проекции Меркатора.

![Демонстрация World Clock Timezone Map Wallpaper](../../assets/world-map-timezone-map-preview.gif)

## Реализованные функции

- Мировые часы и линия дня и ночи в реальном времени
- Часовые пояса IANA и переход на летнее время
- Текущий, предустановленные и пользовательские JSON-города
- Карта с центром по Атлантическому или Тихому океану
- Девять языков интерфейса

## Установка

[Мастерская Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3747734053)

## Использование

Добавляемые вручную часовые пояса должны присутствовать в [списке городов IANA tzdb 2026b](https://data.iana.org/time-zones/tzdb-2026b/zone1970.tab). В проекте используется версия IANA 2026b.

### Настройка своего города

Для Пекина укажите в настройках обоев Wallpaper Engine:

| Параметр | Значение |
| --- | --- |
| Мой часовой пояс | `Asia/Shanghai` |
| Мой город | `Пекин` |
| Мои координаты | `39.9042,116.4074` |

Формат координат: `широта,долгота`. Для южной широты и западной долготы используются отрицательные значения. В IANA нет отдельного часового пояса Пекина, поэтому используется `Asia/Shanghai`.

### Добавление пользовательских городов

Поле «Другие города (JSON)» принимает один или несколько объектов городов. Квадратные скобки массива можно опустить.

#### Указать все данные города

На примере Мумбаи укажите часовой пояс, название и координаты:

```json
{"timeZone":"Asia/Kolkata","name":"Мумбаи","lat":19.076,"lon":72.8777}
```

#### Указать только часовой пояс

На примере Дублина укажите только часовой пояс IANA. Название города и координаты будут добавлены автоматически:

```json
{"timeZone":"Europe/Dublin"}
```

`timeZone` обязателен; `name`, `lat` и `lon` можно опустить.

#### Добавить несколько городов

Разделяйте объекты городов запятыми:

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
{
	"timeZone": "Asia/Kolkata",
	"name": "Mumbai",
	"lat": 18.981050,
	"lon": 72.826784
},
{"timeZone": "Asia/Bangkok"},
{"timeZone": "Asia/Shanghai"},

{"timeZone": "America/Sao_Paulo"},
{"timeZone": "America/Lima"},
{"timeZone": "America/Santiago"},

{"timeZone": "Africa/Johannesburg"},
{"timeZone": "Australia/Sydney"},
{"timeZone": "Pacific/Auckland"},
```
