[简体中文](../../README.md) | [繁體中文](README.zh-Hant.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | Español | [Русский](README.ru.md) | [Português](README.pt.md) | [Deutsch](README.de.md)

# World Clock Timezone Map Wallpaper

Un reloj mundial para Wallpaper Engine que muestra la hora local, el estado de día o noche y el terminador solar en tiempo real sobre un mapa Mercator.

![Demostración de World Clock Timezone Map Wallpaper](../../assets/world-map-timezone-map-preview.gif)

## Funciones implementadas

- Relojes mundiales y terminador solar en tiempo real
- Zonas horarias IANA y horario de verano
- Ciudad actual, ciudades predefinidas y ciudades JSON
- Mapas centrados en el Atlántico o el Pacífico
- Nueve idiomas de interfaz

## Instalación

[Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3747734053)

## Uso

Las zonas horarias añadidas manualmente deben aparecer en la [lista de ciudades de IANA tzdb 2026b](https://data.iana.org/time-zones/tzdb-2026b/zone1970.tab). Este proyecto utiliza la versión 2026b de IANA.

### Configurar mi ciudad

Para Pekín, introduce estos valores en la configuración del fondo de Wallpaper Engine:

| Ajuste | Valor |
| --- | --- |
| Mi zona horaria | `Asia/Shanghai` |
| Mi ciudad | `Pekín` |
| Mis coordenadas | `39.9042,116.4074` |

Las coordenadas usan el formato `latitud,longitud`. Usa valores negativos para el sur y el oeste. IANA no incluye una zona horaria exclusiva para Pekín, por lo que se utiliza `Asia/Shanghai`.

### Añadir ciudades personalizadas

“Más ciudades (JSON)” admite uno o varios objetos de ciudad. Se pueden omitir los corchetes del array.

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
{
	"timeZone": "Asia/Kolkata",
	"name": "Bombay",
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
