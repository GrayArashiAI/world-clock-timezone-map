[简体中文](../../README.md) | [繁體中文](README.zh-Hant.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | Español | [Русский](README.ru.md) | [Português](README.pt.md) | [Deutsch](README.de.md) | [Français](README.fr.md)

# World Clock Timezone Map Wallpaper

Un reloj mundial para Wallpaper Engine que muestra la hora local, el estado de día o noche y el terminador solar en tiempo real sobre un mapa Mercator.

![Demostración de World Clock Timezone Map Wallpaper](../../assets/world-map-timezone-map-preview.gif)

## Funciones implementadas

- Relojes mundiales y terminador solar en tiempo real
- Zonas horarias IANA y horario de verano
- Ciudad actual, ciudades predefinidas y ciudades JSON
- Mapas centrados en el Atlántico o el Pacífico
- Diez idiomas de interfaz

## Instalación

[Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3747734053)

## Uso

La lista de ciudades de IANA se usa para elegir las zonas horarias introducidas manualmente. La ciudad que se muestra no tiene que aparecer en esa lista; si no tiene una entrada IANA propia, elige una ciudad IANA de la misma zona horaria. Este proyecto utiliza la versión 2026b de IANA.

Lista de ciudades de IANA: [lista de ciudades de IANA](https://data.iana.org/time-zones/tzdb-2026b/zone.tab)

### Configurar mi ciudad

Mi ciudad tiene tres valores opcionales; todos pueden dejarse en blanco:

| Ajuste | Cómo rellenarlo | Si se deja en blanco |
| --- | --- | --- |
| Mi zona horaria | Zona horaria IANA, como `Asia/Shanghai` | Se detecta automáticamente desde la zona horaria del sistema |
| Mi ciudad | Nombre de ciudad que se mostrará | Se deduce automáticamente de la zona horaria |
| Mis coordenadas | `latitud,longitud`; usa valores negativos para el sur y el oeste | Se deducen automáticamente de la zona horaria |

IANA no tiene una entrada propia para Pekín. Como Pekín comparte la zona horaria `Asia/Shanghai`, usa estos valores para mostrar Pekín:

| Ajuste | Valor |
| --- | --- |
| Mi zona horaria | `Asia/Shanghai` |
| Mi ciudad | `Pekín` |
| Mis coordenadas | `39.9042,116.4074` |

### Añadir ciudades personalizadas

“Más ciudades (ver descripción del Workshop)” admite uno o varios objetos de ciudad. Se pueden omitir los corchetes del array.

#### Especificar todos los datos

Usando Bombay como ejemplo, especifica la zona horaria, el nombre y las coordenadas:

```json
{"timeZone":"Asia/Kolkata","name":"Bombay","lat":19.076,"lon":72.8777}
```

#### Especificar solo la zona horaria

Usando Dublín como ejemplo, introduce solo su zona horaria IANA. El nombre y las coordenadas se completan automáticamente:

```json
{"timeZone":"Europe/Dublin"}
```

`timeZone` es obligatorio; `name`, `lat` y `lon` son opcionales.

#### Añadir varias ciudades

Separa los objetos de ciudad con comas:

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
{"timeZone":"Asia/Kolkata","name":"Bombay","lat":19.076,"lon":72.8777},
{"timeZone": "Asia/Bangkok"},
{"timeZone":"Asia/Shanghai","name":"Pekín","lat":39.9042,"lon":116.4074},

{"timeZone": "America/Sao_Paulo"},
{"timeZone": "America/Lima"},
{"timeZone": "America/Santiago"},

{"timeZone": "Africa/Johannesburg"},
{"timeZone": "Australia/Sydney"},
{"timeZone": "Pacific/Auckland"},
```
