[简体中文](../../README.md) | [繁體中文](README.zh-Hant.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Русский](README.ru.md) | [Português](README.pt.md) | [Deutsch](README.de.md) | Français

# World Clock Timezone Map Wallpaper

Une horloge mondiale pour Wallpaper Engine qui affiche les heures locales des villes, l'état jour-nuit et le terminateur solaire en temps réel sur une carte du monde en projection de Mercator.

![Démo de World Clock Timezone Map Wallpaper](../../assets/world-map-timezone-map-preview.gif)

## Fonctionnalités implémentées

- Horloges mondiales et terminateur solaire en temps réel
- Fuseaux horaires IANA et heure d'été
- Ville actuelle, villes prédéfinies et villes JSON personnalisées
- Cartes centrées sur l'Atlantique ou le Pacifique
- Dix langues d'interface

## Installation

[Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3747734053)

## Utilisation

La liste des villes IANA sert à choisir les fuseaux horaires saisis manuellement. La ville affichée n'a pas besoin de figurer dans cette liste ; si elle n'a pas d'entrée IANA dédiée, choisissez une ville IANA du même fuseau horaire. Ce projet utilise la version IANA 2026b.

Liste des villes IANA : [liste des villes IANA](https://data.iana.org/time-zones/tzdb-2026b/zone.tab)

### Définir ma ville

Ma ville comporte trois valeurs facultatives ; elles peuvent toutes rester vides :

| Paramètre | Comment le remplir | Si le champ reste vide |
| --- | --- | --- |
| Mon fuseau horaire | Fuseau horaire IANA, par exemple `Asia/Shanghai` | Détecté automatiquement depuis le fuseau horaire du système |
| Ma ville | Nom de la ville à afficher | Déduit automatiquement du fuseau horaire |
| Mes coordonnées | `latitude,longitude` ; utilisez des valeurs négatives pour le sud et l'ouest | Déduites automatiquement du fuseau horaire |

IANA n'a pas d'entrée dédiée pour Pékin. Comme Pékin partage le fuseau horaire `Asia/Shanghai`, utilisez ces valeurs pour afficher Pékin :

| Paramètre | Valeur |
| --- | --- |
| Mon fuseau horaire | `Asia/Shanghai` |
| Ma ville | `Pékin` |
| Mes coordonnées | `39.9042,116.4074` |

### Ajouter des villes personnalisées

« Ajouter des villes (cf. description Workshop) » accepte un ou plusieurs objets de ville. Les crochets du tableau peuvent être omis.

#### Spécifier toutes les données d'une ville

Avec Mumbai comme exemple, indiquez son fuseau horaire, son nom et ses coordonnées :

```json
{"timeZone":"Asia/Kolkata","name":"Mumbai","lat":19.076,"lon":72.8777}
```

#### Spécifier seulement un fuseau horaire

Avec Dublin comme exemple, indiquez seulement son fuseau horaire IANA. Le nom de la ville et les coordonnées sont complétés automatiquement :

```json
{"timeZone":"Europe/Dublin"}
```

`timeZone` est obligatoire ; `name`, `lat` et `lon` sont facultatifs.

#### Ajouter plusieurs villes

Séparez les objets de ville par des virgules :

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
{"timeZone":"Asia/Shanghai","name":"Pékin","lat":39.9042,"lon":116.4074},

{"timeZone": "America/Sao_Paulo"},
{"timeZone": "America/Lima"},
{"timeZone": "America/Santiago"},

{"timeZone": "Africa/Johannesburg"},
{"timeZone": "Australia/Sydney"},
{"timeZone": "Pacific/Auckland"},
```
