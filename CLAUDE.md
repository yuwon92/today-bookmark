# Today Bookmark — Claude Code 가이드

## 프로젝트 개요

어떤 사이트든 링크를 저장하고 카테고리로 정리하는 북마크 관리 도구.  
**크롬 확장앱** (저장) + **Electron 데스크탑 앱** (열람/관리) 두 클라이언트가 Supabase를 공유.  
백엔드는 Supabase(PostgreSQL + Auth + RLS), UI는 레트로 픽셀 OS 스타일.

---

## 기술 스택

- **크롬 확장앱**: Manifest V3, React 19, TypeScript, Vite, @crxjs/vite-plugin
- **데스크탑 앱**: Electron 34, React 19, TypeScript, electron-vite, electron-builder
- **백엔드**: Supabase (PostgreSQL, Auth, Row Level Security)
- **스타일**: Tailwind CSS v4 + 커스텀 레트로 픽셀 CSS
- **패키지**: pnpm workspaces

---

## 핵심 명령어

```bash
# 크롬 확장앱
pnpm extension:dev      # 개발 서버 (HMR)
pnpm extension:build    # 빌드 → apps/extension/dist/

# 데스크탑 앱
pnpm desktop:dev        # 개발 서버 (Electron HMR)
pnpm desktop:build      # 빌드만
pnpm desktop:dist       # 빌드 + .exe 설치 파일 생성 → apps/desktop/dist/

# 공통
pnpm install            # 전체 의존성 설치
```

---

## 주요 파일 경로

### 크롬 확장앱

| 파일 | 역할 |
|------|------|
| `apps/extension/src/popup/Popup.tsx` | 메인 UI — 탭(Save/All/Fav/Cat), 저장폼, 목록, 북마크 상세뷰, 카테고리 CRUD |
| `apps/extension/src/popup/index.css` | 레트로 픽셀 CSS 테마 전체 |
| `apps/extension/src/lib/supabase.ts` | Supabase 클라이언트 + 공유 타입 (Bookmark, Category) |
| `apps/extension/src/lib/claude.ts` | Claude API 호출 — system prompt + few-shot + 견고한 JSON 추출로 카테고리/태그 자동 추천 |
| `apps/extension/src/lib/jinaReader.ts` | X(트위터) URL 판별 + `r.jina.ai`로 본문 우회 추출 |
| `apps/extension/src/lib/metaParser.ts` | 페이지 메타(og) + keywords/article:tag + 본문 800자 추출 (executeScript 주입) |
| `apps/extension/src/background/service-worker.ts` | 25분마다 Supabase 세션 갱신 |
| `apps/extension/manifest.json` | MV3 manifest — 권한, 팝업, 아이콘 경로 (`host_permissions`에 `r.jina.ai` 포함) |
| `apps/extension/.env` | Supabase URL + 키 + Claude API 키 + Jina API 키 (gitignore됨) |

### 데스크탑 앱

| 파일 | 역할 |
|------|------|
| `apps/desktop/src/main/index.ts` | BrowserWindow 생성 (420×860, frame:false) + IPC 핸들러 |
| `apps/desktop/src/preload/index.ts` | contextBridge — `window.electron.openExternal/minimize/close` |
| `apps/desktop/src/renderer/App.tsx` | 메인 레이아웃, 상태 관리, 데이터 로드, Realtime 구독 |
| `apps/desktop/src/renderer/lib/supabase.ts` | Supabase 클라이언트 (localStorage 기반 세션) |
| `apps/desktop/src/renderer/index.css` | 레트로 픽셀 CSS + 데스크탑 전용 클래스 |
| `apps/desktop/src/renderer/components/RandomBanner.tsx` | 랜덤 북마크 배너 (🔀 재선택) |
| `apps/desktop/src/renderer/components/BookmarkTicker.tsx` | 하단 ticker — 북마크 제목 흐름, 클릭 시 열기 |
| `apps/desktop/src/renderer/components/BookmarkDetail.tsx` | 북마크 상세 패널 — 제목/카테고리/태그/메모 인라인 편집 |
| `apps/desktop/src/renderer/components/BookmarkItem.tsx` | 북마크 목록 행 — 단일클릭: 상세 패널 / 더블클릭: URL 열기 |
| `apps/desktop/src/renderer/components/CategoriesView.tsx` | 카테고리별 북마크 목록 + 인라인 편집 |
| `apps/desktop/resources/icon.png` | 앱 아이콘 (256×256 이상 필요, electron-builder용) |
| `apps/desktop/.env` | Supabase URL + 키 (gitignore됨, 확장앱과 동일 값) |

### 공통

| 파일 | 역할 |
|------|------|
| `supabase/schema.sql` | DB 스키마 (categories, bookmarks + RLS + 인덱스) |
| `pnpm-workspace.yaml` | workspace 설정 + allowBuilds (esbuild, electron, app-builder-bin) |

---

## 아키텍처 핵심

### Supabase 인증 — 클라이언트별 세션 저장 방식

| 클라이언트 | 세션 저장소 | 이유 |
|-----------|------------|------|
| 크롬 확장앱 | `chrome.storage.local` (커스텀 어댑터) | service worker에 localStorage 없음 |
| 데스크탑 앱 | `localStorage` (기본값) | Electron renderer는 브라우저 환경 |

### 데스크탑 앱 IPC 구조

```
renderer → window.electron.openExternal(url)
renderer → window.electron.minimize()
renderer → window.electron.close()
         ↕ contextBridge (preload/index.ts)
main    → shell.openExternal(url)
main    → BrowserWindow.minimize/close
```

`shell.openExternal`은 main 프로세스에서만 사용 가능하므로 반드시 IPC를 거쳐야 함.

### 메타데이터 추출 (확장앱)

- `chrome.scripting.executeScript`로 `extractPageMeta` 함수를 현재 탭에 주입
- 함수가 외부 import 없이 완전히 독립적이어야 함 (직렬화되어 전송)
- 추출 항목: `url / title / description / thumbnail / siteName / keywords[] / bodyExcerpt(최대 800자)`
- 본문은 `<main>` → `<article>` → `<body>` 순서로 폴백, 공백 정규화 후 슬라이스

### X(트위터) 본문 우회 — Jina Reader

- X는 SPA라 `executeScript`로는 본문이 거의 안 잡힘 → `r.jina.ai/{url}` GET으로 우회
- `jinaReader.ts`의 `isXUrl()` 로 도메인 판별 (`x.com`, `twitter.com`, `mobile.twitter.com`)
- 호출 위치: `Popup.tsx` Save 탭의 meta 로드 `useEffect` 안에서 `extractPageMeta` 직후 `bodyExcerpt` 덮어쓰기
- API 키 없이도 동작(무료 티어), `VITE_JINA_API_KEY` 있으면 `Authorization: Bearer ...`로 레이트 제한 해제
- 응답은 markdown/plain text → 공백 정규화 후 1500자 슬라이스

### INSERT 시 user_id 필수

- Supabase RLS 정책이 `auth.uid() = user_id` 조건으로 동작
- `supabase.from('bookmarks').insert(...)` 시 반드시 `user_id: user.id` 포함

---

## DB 스키마 요약

```sql
categories (id, user_id, name, color, description, created_at)
bookmarks  (id, user_id, url, title, description, thumbnail,
            category_id, note, tags[], is_favorite, date_saved)
```

- RLS: 각 유저는 자신의 행만 접근 가능
- 기존 DB 마이그레이션:
  - `ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;`
  - `ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';`
- `categories.description`: AI 추천 시 카테고리의 *범위(scope)* 를 모델에 전달하기 위한 필드. 빈 문자열이어도 동작.

---

## UI 디자인 시스템

**레트로 픽셀 OS / 파스텔 라벤더** 컨셉

| CSS 클래스 | 역할 |
|-----------|------|
| `.pixel-titlebar` | 라벤더 그라디언트 타이틀바 (`-webkit-app-region: drag` 포함, 데스크탑) |
| `.pixel-titlebar-controls` | `-webkit-app-region: no-drag` (버튼 영역) |
| `.pixel-bg` | dot 패턴 배경 (#E9E3FF) |
| `.pixel-panel` | 그룹 박스 |
| `.pixel-btn` / `.pixel-btn-primary` | bevel 버튼 (inset shadow) |
| `.pixel-input` | recessed 인풋 |
| `.pixel-bookmark-item` | 북마크 목록 행 |
| `.pixel-bottom-nav` / `.pixel-bottom-tab` | 데스크탑 하단 탭 네비게이션 |
| `.pixel-banner` / `.pixel-banner-*` | 데스크탑 랜덤 배너 |
| `.pixel-ticker` / `.pixel-ticker-inner` | 데스크탑 하단 ticker (CSS animation) |
| `.pixel-statusbar` | 하단 상태바 |
| `.pixel-swatch` | 카테고리 색상 선택 스와치 |
| `.pixel-tag` / `.pixel-tag.active` | 태그 칩 (클릭 필터링, 활성 시 반전) |
| `.pixel-detail-overlay` | 북마크 상세 패널 전체 오버레이 |
| `.pixel-detail-header` | 상세 패널 헤더 (뒤로/열기/삭제 버튼) |
| `.pixel-detail-section` | 상세 패널 섹션 구분 행 |

컬러: `--bg: #E9E3FF`, `--border: #4A425F`, `--accent: #C8B8FF`, `--text: #2E2A3A`  
폰트: `Courier New` (모든 요소)  
테두리: 항상 직각 (`border-radius: 0 !important`)

---

## 크롬 확장앱 탭 구조

```
[💾 Save] [📋 All] [⭐ Fav] [🗂 Cat]
```

- **Save**: 현재 탭 URL 자동 추출, 카테고리/태그/메모 입력 후 저장. Claude API로 기존 카테고리·태그 기반 자동 추천 (메타 로드 완료 후 자동 실행)
- **All / Fav**: 북마크 목록. 단일클릭 → 상세 뷰 / 더블클릭 → 탭으로 URL 열기. 태그 칩 클릭으로 필터링
- **Cat**: 카테고리 CRUD (색상 8가지 프리셋)

---

## 데스크탑 앱 레이아웃

```
┌─────────────────────────┐  420px
│ 📎 Today Bookmark  [_][×]│  타이틀바 (드래그 이동)
├─────────────────────────┤
│ 🎲 오늘의 추천   [🔀]   │  RandomBanner
│ [썸네일] 제목            │
│         도메인  [열기]   │
├─────────────────────────┤
│ 🔍 검색창                │  (Cat 탭에서는 숨김)
├─────────────────────────┤
│                          │
│  북마크 목록 (스크롤)    │  flex-1
│                          │
├─────────────────────────┤
│ [📋 All][⭐ Fav][🗂 Cat] │  BottomNav
├─────────────────────────┤
│ ← 북마크제목 · 제목 →   │  BookmarkTicker (24px)
└─────────────────────────┘  860px
```

---

## 데스크탑 .exe 패키징

```bash
pnpm desktop:dist
# → apps/desktop/dist/Today Bookmark Setup 1.0.0.exe
```

- `electron-builder` NSIS 방식 (원클릭 설치)
- `apps/desktop/resources/icon.png` 을 앱 아이콘으로 사용 (256×256 이상 필요)
- 빌드 설정: `apps/desktop/package.json`의 `"build"` 필드

---

## Claude API 연동 (확장앱)

### 기본
- 모델: `claude-haiku-4-5-20251001` (가장 저렴, 응답 빠름)
- 호출 시점: Save 탭에서 메타데이터 로드 완료 + categories 로드 완료 동시에 (1회만)
- 브라우저 직접 호출이므로 반드시 `anthropic-dangerous-direct-browser-access: true` 헤더 필요
- API 키: `apps/extension/.env`에 `VITE_CLAUDE_API_KEY=sk-ant-...` (없으면 추천만 비활성)

### 호출 본문 구조
- `max_tokens: 400`, `temperature: 0` (결정적 응답)
- `system` 메시지에 규칙 분리 (캐시 효율 ↑)
- `messages`: `[...few-shot, user(현재 페이지)]` 구조

### 입력 데이터
`suggestCategoryAndTags({ meta, categories, tagPool, recentExamples })`:
- `meta`: `PageMeta` 전체 — title/url/description/siteName/keywords/bodyExcerpt
- `categories`: `{ name, description }[]` — 카테고리 설명은 모델에 scope hint로 작용
- `tagPool`: 사용자의 모든 태그 빈도 desc 정렬 후 상위 50개 (토큰 절약 + 재사용 유도)
- `recentExamples`: 최근 5개 북마크 (카테고리 분류된 것만 — null 예시는 모델이 모방함)

### Few-shot 형식
각 예시는 `Categories available: A, B, C` 줄을 포함해 "선택지 → 정답" 패턴을 학습시킴.
user에 카테고리 목록과 example bookmark, assistant에 JSON 응답.

### System prompt 핵심 규칙
- "STRONGLY prefer picking a category over null. Only return null if NONE fit."
- "I'm not 100% sure is NOT a reason for null." — 모델의 null 편향 방지
- 태그는 lowercase, 하이픈, max 20자, 기존 태그 풀 재사용 우선
- 우선순위: title → bodyExcerpt → description → site → keywords

### 응답 파싱 — `extractJsonObject`
- prefill 트릭(`assistant: '{"category":'`)은 system prompt가 길어지면 깨지기 쉬워서 사용하지 않음
- 응답 텍스트에서 첫 `{` 부터 짝맞는 `}` 까지 균형 카운팅으로 추출 (코드블록/잡설/중첩 객체 모두 처리)
- 디버깅: `console.debug('[claude.ts] raw response:', raw)` — popup DevTools 콘솔에서 확인 가능

### 흔한 회귀
1. **카테고리만 항상 null** → few-shot에 미분류 북마크가 섞였거나 system prompt가 너무 보수적. Popup.tsx에서 `category_id` 있는 것만 필터링하고, system rule에 "prefer a category" 명시
2. **태그/카테고리 둘 다 빈 값** → 응답 파싱 실패로 catch 진입. raw 응답을 콘솔에서 먼저 확인. JSON 형식 불일치면 `extractJsonObject` 보강

## Supabase Realtime 설정

데스크탑 앱이 실시간으로 북마크 변경사항을 수신하려면:

1. Supabase 대시보드 → **Database → Publications**
2. `supabase_realtime` publication 클릭
3. `bookmarks` 테이블 토글 ON

## 향후 작업

- 읽기 상태 관리 (to-read / done)
- 링크 유효성 검사 (죽은 링크 표시)

---

## 주의사항

- `.env` 파일은 gitignore됨 — 클론 후 확장앱/데스크탑 각각 생성 필요
- 확장앱 `.env`에 `VITE_CLAUDE_API_KEY` 없으면 AI 추천 기능만 비활성화됨 (나머지 정상 동작)
- `VITE_JINA_API_KEY`는 선택. 없어도 X 본문 추출은 무료 티어로 동작 (레이트 제한만 낮음)
- `categories.description` 컬럼은 기존 DB에 없을 수 있음 → 추천 코드가 INSERT/UPDATE 시 description을 보내므로 마이그레이션 SQL 필수: `ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';`
  - 컬럼 추가 후에도 Supabase의 PostgREST 스키마 캐시가 즉시 갱신 안 될 수 있음 → 대시보드 Settings → API → "Reload schema cache"
- 친구 배포 시 친구 Supabase 키로 빌드 후 `dist` 폴더를 zip으로 전달 (확장앱)
- pnpm v11 사용, `pnpm-workspace.yaml`에 `allowBuilds` 설정 필요 (esbuild, electron, app-builder-bin)
- 데스크탑 앱 `resources/icon.png`은 256×256px 이상이어야 electron-builder가 정상 동작
- Supabase Realtime은 대시보드에서 `bookmarks` / `categories` 테이블 수동 활성화 필요 (Database → Publications)
