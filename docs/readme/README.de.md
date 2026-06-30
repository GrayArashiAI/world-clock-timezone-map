[简体中文](../../README.md) | [繁體中文](README.zh-Hant.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Русский](README.ru.md) | [Português](README.pt.md) | Deutsch | [Français](README.fr.md)

# World Clock Timezone Map Wallpaper

Eine Weltzeituhr für Wallpaper Engine, die Ortszeiten, Tag und Nacht sowie den aktuellen Sonnen-Terminator auf einer Mercator-Weltkarte darstellt.

![Demo von World Clock Timezone Map Wallpaper](../../assets/world-map-timezone-map-preview.gif)

## Implementierte Funktionen

- Weltzeiten und Tag-Nacht-Grenze in Echtzeit
- IANA-Zeitzonen und Sommerzeit
- Eigene, voreingestellte und per JSON definierte Städte
- Atlantik- und Pazifik-zentrierte Kartenansicht
- Zehn Oberflächensprachen

## Installation

[Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3747734053)

## Verwendung

Die IANA-Städteliste dient zur Auswahl manuell eingetragener Zeitzonen. Die angezeigte Stadt muss nicht in dieser Liste stehen; wenn es keinen eigenen IANA-Eintrag gibt, wählen Sie eine IANA-Stadt in derselben Zeitzone. Dieses Projekt verwendet die IANA-Version 2026b.

IANA-Städteliste: [IANA-Städteliste](https://data.iana.org/time-zones/tzdb-2026b/zone.tab)

### Eigene Stadt einstellen

Die eigene Stadt hat drei optionale Werte; alle können leer bleiben:

| Einstellung | Eingabe | Bei leerem Feld |
| --- | --- | --- |
| Eigene Zeitzone | IANA-Zeitzone, z. B. `Asia/Shanghai` | Wird automatisch aus der Systemzeitzone ermittelt |
| Eigene Stadt | Anzuzeigender Stadtname | Wird automatisch aus der Zeitzone abgeleitet |
| Eigene Koordinaten | `Breitengrad,Längengrad`; für Süden und Westen negative Werte verwenden | Werden automatisch aus der Zeitzone abgeleitet |

IANA führt keinen eigenen Eintrag für Peking. Da Peking die Zeitzone `Asia/Shanghai` nutzt, tragen Sie zum Anzeigen von Peking folgende Werte ein:

| Einstellung | Wert |
| --- | --- |
| Eigene Zeitzone | `Asia/Shanghai` |
| Eigene Stadt | `Peking` |
| Eigene Koordinaten | `39.9042,116.4074` |

### Benutzerdefinierte Städte hinzufügen

„Mehr Städte (s. Workshop-Beschreibung)“ akzeptiert ein oder mehrere Stadtobjekte. Die eckigen Klammern des Arrays können weggelassen werden.

#### Alle Stadtdaten angeben

Am Beispiel Mumbai werden Zeitzone, Name und Koordinaten angegeben:

```json
{"timeZone":"Asia/Kolkata","name":"Mumbai","lat":19.076,"lon":72.8777}
```

#### Nur die Zeitzone angeben

Am Beispiel Dublin wird nur die IANA-Zeitzone angegeben. Stadtname und Koordinaten werden automatisch ergänzt:

```json
{"timeZone":"Europe/Dublin"}
```

`timeZone` ist erforderlich; `name`, `lat` und `lon` sind optional.

#### Mehrere Städte hinzufügen

Stadtobjekte werden durch Kommas getrennt:

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
{"timeZone":"Asia/Shanghai","name":"Peking","lat":39.9042,"lon":116.4074},

{"timeZone": "America/Sao_Paulo"},
{"timeZone": "America/Lima"},
{"timeZone": "America/Santiago"},

{"timeZone": "Africa/Johannesburg"},
{"timeZone": "Australia/Sydney"},
{"timeZone": "Pacific/Auckland"},
```
