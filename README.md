# deploy-practice

## ⚠️ 정리할 때 절대 지우지 마세요

이 저장소는 **수업에서 실제로 쓰는 웹페이지**가 올라가 있는 곳입니다.
GitHub에 파일을 올리면 Vercel이 자동으로 배포하기 때문에, **여기서 폴더나 파일을 지우면 그 주소가 바로 사라집니다.**
학생들이 패들렛에서 누르는 링크도 함께 끊깁니다.

| 지우면 안 되는 것 | 주소 | 용도 |
|---|---|---|
| `api/` (안의 `_lib`, `_private` 포함) | | 입장 코드 확인 + **게임 파일이 들어 있는 곳** |
| `api/_private/ai-ethics-city/` | https://deploy-practice-wine.vercel.app/ai-ethics-city/ | AI 윤리 놀이도시 — 석전중 3학년 3교시(2026-10-14), 패들렛 링크 |
| `api/_private/playcity/` | https://deploy-practice-wine.vercel.app/playcity/ | 스마트 놀이도시 |
| `api/_private/playcity-standalone/` | https://deploy-practice-wine.vercel.app/playcity-standalone.html | 스마트 놀이도시 한 파일 버전 |
| `vercel.json` | | 주소 연결(rewrites)과 배포 설정 |

나머지(`index.html`)도 확실하지 않으면 그대로 두세요.

### 이것도 하지 마세요

- 폴더나 파일 **이름 바꾸기** — 주소가 바뀌어서 기존 링크가 끊깁니다
- 저장소 **이름 바꾸기 · 삭제**
- Vercel의 `deploy-practice` 프로젝트 **삭제** 또는 GitHub **연결 해제**

---

## 입장 코드 방식 (수업 코드)

놀이도시는 **수업 코드를 입력해야 열립니다.** 주소는 예전과 같습니다.

- 학생이 `/ai-ethics-city/` 나 `/playcity/` 를 열면 코드 입력 화면이 먼저 뜹니다.
- 코드는 **정해 둔 수업 날짜(한국 시간) 하루 동안만** 쓸 수 있습니다.
- 한 번 입장한 기기는 그날 자정까지 다시 입력하지 않아도 됩니다.
- 게임 파일은 `api/_private/` 안에 있어서 주소로 바로 받아 갈 수 없고, 입장 확인을 통과해야만 내려갑니다.

### 코드 발급 (송 전용)

1. **`/class-admin`** 에 들어가 관리자 비밀번호로 로그인
2. 반 이름 · 담당 강사(선택) · 수업 날짜 · 예상 인원(선택) · 쓸 수 있는 놀이도시를 고르고 **코드 발급**
3. 나온 큰 코드를 칠판이나 화면에 띄워 학생에게 안내 (`크게 보기` 버튼으로 다시 열 수 있음)
4. 수업 중 문제가 생기면 목록에서 **중지** → 이미 들어온 학생도 새로고침하면 막힘 (`다시 켜기`로 되돌림)

코드는 `ABC-DEF` 처럼 6글자이고, 헷갈리는 글자(0·O·1·I·L)는 쓰지 않습니다.
관리 화면에는 코드별로 **들어온 기기 수**와 **살펴볼 것**(예상 인원 초과, 틀린 입력이 몰림)이 표시됩니다.
접속 주소(IP)는 저장하지 않고, 같은 곳인지만 구분하는 짧은 지문만 씁니다.

### 처음 한 번 해야 하는 설정 (Vercel)

| 할 일 | 방법 |
|---|---|
| ① 관리자 비밀번호 | 프로젝트 → Settings → Environment Variables → `ADMIN_PASSWORD` = (8자 이상, 길게). Production·Preview·Development 모두 체크 |
| ② 코드 저장소 | 프로젝트 → Storage → Create Database → **Upstash (Redis)** 무료 → 프로젝트에 연결. `KV_REST_API_URL`·`KV_REST_API_TOKEN` 이 자동으로 들어옵니다 |
| ③ (선택) 서명 키 | `SESSION_SECRET` 을 따로 넣으면 입장 쿠키 서명에 그 값을 씁니다. 안 넣으면 `ADMIN_PASSWORD` 에서 만듭니다 |

설정이 끝나기 전에는 놀이도시가 "아직 준비 중이에요" 화면으로 닫혀 있습니다. **환경변수를 바꾸면 Redeploy가 필요합니다.**
`ADMIN_PASSWORD` 를 바꾸면 이미 입장한 학생·로그인한 관리자도 모두 다시 입력해야 합니다.

### 게임 파일을 고칠 때

예전과 같이 **지우지 말고 같은 이름으로 덮어씁니다.** 위치만 바뀌었습니다.

- AI 윤리 놀이도시 → `api/_private/ai-ethics-city/index.html`
- 스마트 놀이도시 → `api/_private/playcity/` (여러 파일), 한 파일 버전은 `api/_private/playcity-standalone/index.html`
- GitHub에서 해당 폴더로 들어가 Add file → Upload files → 같은 이름으로 올리고 Commit
- `api/_private/_ui/` 는 코드 입력 화면(`gate.html`)과 관리 화면(`admin.html`)입니다

### 알아 둘 점

- 예전에 오프라인 캐시(서비스워커)로 저장된 기기는, 인터넷에 한 번 연결되면 캐시가 자동으로 지워집니다. 이제 **입장할 때는 인터넷이 필요**합니다. 입장한 뒤에는 새로고침하지 않는 한 끊겨도 계속 돌아갑니다.
- 이 저장소가 **공개(public)** 이면 누구나 GitHub에서 게임 파일을 볼 수 있어 입장 코드의 효과가 줄어듭니다. 저장소를 **비공개(private)** 로 바꾸면 해결됩니다. (Vercel 무료 플랜도 개인 계정의 비공개 저장소를 배포할 수 있습니다.)
- 한 파일 버전을 내려받아 저장해 간 사람은 코드 없이도 열 수 있습니다. 이건 기술적으로 막을 수 없습니다.
- 시험 서버처럼 쓰는 `PLAYCITY_STORE=memory` 는 컴퓨터에서 시험할 때만 동작하고 Vercel에서는 무시됩니다.
