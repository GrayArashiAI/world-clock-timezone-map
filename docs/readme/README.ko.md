[简体中文](../../README.md) | [繁體中文](README.zh-Hant.md) | [English](README.en.md) | [日本語](README.ja.md) | 한국어 | [Español](README.es.md) | [Русский](README.ru.md) | [Português](README.pt.md) | [Deutsch](README.de.md) | [Français](README.fr.md)

# World Clock Timezone Map Wallpaper

메르카토르 세계 지도에서 도시별 현지 시각, 낮과 밤, 실시간 주야 경계선을 표시하는 Wallpaper Engine용 세계 시계 배경화면입니다.

![World Clock Timezone Map Wallpaper 데모](../../assets/world-map-timezone-map-preview.gif)

## 구현 기능

- 실시간 세계 시계와 주야 경계선
- IANA 시간대 및 일광 절약 시간 지원
- 현재 도시, 기본 도시, JSON 사용자 지정 도시
- 대서양 중심 및 태평양 중심 지도
- 10개 인터페이스 언어

## 설치

[Steam 창작마당](https://steamcommunity.com/sharedfiles/filedetails/?id=3747734053)

## 사용 방법

IANA 도시 목록은 수동으로 입력하는 시간대를 고르는 기준입니다. 표시할 도시가 반드시 이 목록에 있을 필요는 없습니다. 별도 IANA 항목이 없으면 같은 시간대의 IANA 도시를 선택하세요. 이 프로젝트에서 사용하는 IANA 버전은 2026b입니다.

IANA 도시 목록: [IANA 도시 목록](https://data.iana.org/time-zones/tzdb-2026b/zone.tab)

### 내 도시 설정

내 도시에는 선택 입력값이 세 가지 있으며, 모두 비워 둘 수 있습니다:

| 설정 | 입력 방법 | 비워 두면 |
| --- | --- | --- |
| 내 시간대 | `Asia/Shanghai` 같은 IANA 시간대 | 시스템 시간대에서 자동으로 가져옵니다 |
| 내 도시 | 표시할 도시 이름 | 시간대에서 자동으로 추론합니다 |
| 내 좌표 | `위도,경도`; 남위와 서경은 음수를 사용합니다 | 시간대에서 자동으로 추론합니다 |

IANA에는 베이징 전용 항목이 없습니다. 베이징은 `Asia/Shanghai`와 같은 시간대를 사용하므로, 베이징을 표시하려면 다음 값을 입력합니다:

| 설정 | 값 |
| --- | --- |
| 내 시간대 | `Asia/Shanghai` |
| 내 도시 | `베이징` |
| 내 좌표 | `39.9042,116.4074` |

### 사용자 지정 도시 추가

“도시 추가(워크숍 설명 참조)”에는 하나 이상의 도시 객체를 입력할 수 있습니다. 배열 대괄호는 생략할 수 있습니다.

#### 모든 도시 정보 지정

뭄바이를 예로 들어 시간대, 이름, 좌표를 함께 지정합니다.

```json
{"timeZone":"Asia/Kolkata","name":"뭄바이","lat":19.076,"lon":72.8777}
```

#### 시간대만 지정

더블린을 예로 들어 IANA 시간대만 입력합니다. 도시 이름과 좌표는 자동으로 채워집니다.

```json
{"timeZone":"Europe/Dublin"}
```

`timeZone`은 필수이며 `name`, `lat`, `lon`은 생략할 수 있습니다.

#### 여러 도시 추가

도시 객체를 쉼표로 구분합니다.

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
{"timeZone":"Asia/Kolkata","name":"뭄바이","lat":19.076,"lon":72.8777},
{"timeZone": "Asia/Bangkok"},
{"timeZone":"Asia/Shanghai","name":"베이징","lat":39.9042,"lon":116.4074},

{"timeZone": "America/Sao_Paulo"},
{"timeZone": "America/Lima"},
{"timeZone": "America/Santiago"},

{"timeZone": "Africa/Johannesburg"},
{"timeZone": "Australia/Sydney"},
{"timeZone": "Pacific/Auckland"},
```
