[简体中文](../../README.md) | [繁體中文](README.zh-Hant.md) | [English](README.en.md) | [日本語](README.ja.md) | 한국어 | [Español](README.es.md) | [Русский](README.ru.md) | [Português](README.pt.md) | [Deutsch](README.de.md)

# World Clock Timezone Map Wallpaper

메르카토르 세계 지도에서 도시별 현지 시각, 낮과 밤, 실시간 주야 경계선을 표시하는 Wallpaper Engine용 세계 시계 배경화면입니다.

![World Clock Timezone Map Wallpaper 데모](../../assets/world-map-timezone-map-preview.gif)

## 구현 기능

- 실시간 세계 시계와 주야 경계선
- IANA 시간대 및 일광 절약 시간 지원
- 현재 도시, 기본 도시, JSON 사용자 지정 도시
- 대서양 중심 및 태평양 중심 지도
- 9개 인터페이스 언어

## 설치

[Steam 창작마당](https://steamcommunity.com/sharedfiles/filedetails/?id=3747734053)

## 사용 방법

수동으로 추가하는 시간대는 [IANA tzdb 2026b 도시 목록](https://data.iana.org/time-zones/tzdb-2026b/zone1970.tab)에 있어야 합니다. 이 프로젝트에서 사용하는 IANA 버전은 2026b입니다.

### 내 도시 설정

베이징을 예로 들어 Wallpaper Engine 배경화면 설정에 다음 값을 입력합니다.

| 설정 | 값 |
| --- | --- |
| 내 시간대 | `Asia/Shanghai` |
| 내 도시 | `베이징` |
| 내 좌표 | `39.9042,116.4074` |

좌표 형식은 `위도,경도`입니다. 남위와 서경은 음수를 사용합니다. IANA에는 베이징 전용 시간대가 없으므로 `Asia/Shanghai`를 사용합니다.

### 사용자 지정 도시 추가

“더 많은 도시 (JSON)”에는 하나 이상의 도시 객체를 입력할 수 있습니다. 배열 대괄호는 생략할 수 있습니다.

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
{
	"timeZone": "Asia/Kolkata",
	"name": "뭄바이",
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
