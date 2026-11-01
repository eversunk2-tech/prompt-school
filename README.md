# 선생님 프롬프트 학교 (prompt-school)

제미나이 노트북(구 NotebookLM)과 제미나이를 수업·업무에 쓰는 프롬프트 모음 사이트입니다.
**관리자 모드(`/admin`)에서 저장하면 사이트에 바로 반영**되고, 사이트 코드는 깃허브에 커밋·푸시하면 자동 배포됩니다.

- 사이트: `public/index.html`
- 관리자: `public/admin.html` (주소 끝에 `/admin`)
- 서버 기능(API): `functions/` (Cloudflare Pages Functions)
- 데이터 저장소: Cloudflare D1 (무료 요금제로 충분)
- 처음 넣을 데이터: `prompts/*.md` → `python3 tools/build_seed.py` → `public/data/seed.json`

## 처음 한 번만: Cloudflare 설정 (약 5분)

1. **Pages 프로젝트 만들기**
   Cloudflare 대시보드 → Workers & Pages → 만들기(Create) → **Pages** 탭 → *Git에 연결(Connect to Git)* → `prompt-school` 저장소 선택
   - 프레임워크 사전 설정: **없음(None)**
   - 빌드 명령: **비워 둠**
   - 빌드 출력 디렉터리: **`public`**
   - 저장 및 배포
2. **D1 데이터베이스 만들기**
   대시보드 → 스토리지 및 데이터베이스(Storage & Databases) → **D1 SQL Database** → 만들기 → 이름 `prompt-school-db`
3. **데이터베이스 연결(바인딩)**
   Pages 프로젝트 → 설정(Settings) → **바인딩(Bindings)** → 추가 → D1 데이터베이스
   - 변수 이름: **`DB`** (대문자 그대로)
   - 데이터베이스: `prompt-school-db`
4. **관리자 비밀번호 넣기**
   Pages 프로젝트 → 설정 → **변수 및 비밀(Variables and Secrets)** → 추가
   - 유형: 비밀(Secret / Encrypt), 이름: **`ADMIN_PASSWORD`**, 값: 원하는 비밀번호
5. **다시 배포**
   배포(Deployments) 탭 → 최근 배포의 … 메뉴 → 다시 시도(Retry deployment)
   (바인딩·비밀번호는 다시 배포해야 적용됩니다.)

처음 사이트를 열면 표가 자동으로 만들어지고 `seed.json` 내용이 한 번 채워집니다.
SQL을 직접 실행할 필요는 없습니다.

## 쓰는 법

- **프롬프트 고치기·추가하기**: `https://(사이트 주소)/admin` → 비밀번호 → 탭 고르기 → 프롬프트 고르기 → 고치고 저장(Ctrl+S).
- **탭 추가·순서 바꾸기**: 관리자 화면 왼쪽 `+ 새 탭`, ↑↓ 버튼.
- **백업**: 관리자 화면 `백업 내려받기(JSON)`. 복원은 `백업으로 전체 복원`.
- **저장소의 seed.json에 새로 넣은 프롬프트 가져오기**: `seed.json 새 항목 가져오기` (이미 있는 항목은 건드리지 않음).

## 프롬프트 표기 규칙

| 표기 | 뜻 | 화면 색 |
|---|---|---|
| `#역할` | 누구로서 | 파랑 |
| `#명령` | 무엇을 | 빨강 |
| `#맥락` `#조건` `#상황` | 어떤 조건에서 | 초록 |
| `#형식` | 어떤 모양으로 | 노랑 |
| `##소제목` | 세부 조건 묶음 | 보라 |
| `[자리표시]` | 내 상황에 맞게 바꿔 넣을 곳 | 노란 바탕 |

## 개발 메모

```bash
python3 tools/build_seed.py                # prompts/*.md → public/data/seed.json
npx wrangler pages dev public --d1 DB      # 로컬 미리보기 (ADMIN_PASSWORD는 .dev.vars에)
```
