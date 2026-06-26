[简体中文](../../README.md) | [繁體中文](README.zh-Hant.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Русский](README.ru.md) | Português | [Deutsch](README.de.md) | [Français](README.fr.md)

# World Clock Timezone Map Wallpaper

Um relógio mundial para o Wallpaper Engine que mostra horários locais, estados de dia e noite e o terminador solar em tempo real sobre um mapa-múndi de Mercator.

![Demonstração do World Clock Timezone Map Wallpaper](../../assets/world-map-timezone-map-preview.gif)

## Funcionalidades implementadas

- Relógios mundiais e terminador solar em tempo real
- Fusos horários IANA e horário de verão
- Cidade atual, cidades predefinidas e cidades JSON
- Mapas centralizados no Atlântico ou no Pacífico
- Dez idiomas de interface

## Instalação

[Oficina Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3747734053)

## Como usar

Os fusos horários adicionados manualmente devem constar na [lista de cidades do IANA](https://data.iana.org/time-zones/tzdb-2026b/zone.tab). Este projeto usa a versão 2026b do IANA.

### Configurar minha cidade

Para Pequim, informe estes valores nas configurações do papel de parede no Wallpaper Engine:

| Configuração | Valor |
| --- | --- |
| Meu fuso horário | `Asia/Shanghai` |
| Minha cidade | `Pequim` |
| Minhas coordenadas | `39.9042,116.4074` |

As coordenadas usam o formato `latitude,longitude`. Use valores negativos para sul e oeste. A IANA não possui um fuso horário exclusivo para Pequim, portanto é usado `Asia/Shanghai`.

### Adicionar cidades personalizadas

“Mais cidades (ver descrição do Workshop)” aceita um ou mais objetos de cidade. Os colchetes do array podem ser omitidos.

#### Informar todos os dados

Usando Bombaim como exemplo, informe o fuso horário, o nome e as coordenadas:

```json
{"timeZone":"Asia/Kolkata","name":"Bombaim","lat":19.076,"lon":72.8777}
```

#### Informar apenas o fuso horário

Usando Dublin como exemplo, informe apenas o fuso horário IANA. O nome e as coordenadas são preenchidos automaticamente:

```json
{"timeZone":"Europe/Dublin"}
```

`timeZone` é obrigatório; `name`, `lat` e `lon` são opcionais.

#### Adicionar várias cidades

Separe os objetos de cidade com vírgulas:

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
{"timeZone":"Asia/Kolkata","name":"Bombaim","lat":19.076,"lon":72.8777},
{"timeZone": "Asia/Bangkok"},
{"timeZone":"Asia/Shanghai","name":"Pequim","lat":39.9042,"lon":116.4074},

{"timeZone": "America/Sao_Paulo"},
{"timeZone": "America/Lima"},
{"timeZone": "America/Santiago"},

{"timeZone": "Africa/Johannesburg"},
{"timeZone": "Australia/Sydney"},
{"timeZone": "Pacific/Auckland"},
```
