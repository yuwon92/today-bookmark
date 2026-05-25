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
| `apps/extension/src/popup/Popup.tsx` | 메인 UI — 탭(Save/All/Fav/Cat), 저장폼, 목록, 카테고리 CRUD |
| `apps/extension/src/popup/index.css` | 레트로 픽셀 CSS 테마 전체 |
| `apps/extension/src/lib/supabase.ts` | Supabase 클라이언트 + 공유 타입 (Bookmark, Category) |
| `apps/extension/src/lib/metaParser.ts` | 페이지 og 메타데이터 추출 함수 (executeScript에 주입) |
| `apps/extension/src/background/service-worker.ts` | 25분마다 Supabase 세션 갱신 |
| `apps/extension/manifest.json` | MV3 manifest — 권한, 팝업, 아이콘 경로 |
| `apps/extension/.env` | Supabase URL + 키 (gitignore됨) |

### 데스크탑 앱

| 파일 | 역할 |
|------|------|
| `apps/desktop/src/main/index.ts` | BrowserWindow 생성 (420×860, frame:false) + IPC 핸들러 |
| `apps/desktop/src/preload/index.ts` | contextBridge — `window.electron.openExternal/minimize/close` |
| `apps/desktop/src/renderer/App.tsx` | 메인 레이아웃, 상태 관리, 데이터 로드 |
| `apps/desktop/src/renderer/lib/supabase.ts` | Supabase 클라이언트 (localStorage 기반 세션) |
| `apps/desktop/src/renderer/index.css` | 레트로 픽셀 CSS + 데스크탑 전용 클래스 |
| `apps/desktop/src/renderer/components/RandomBanner.tsx` | 랜덤 북마크 배너 (🔀 재선택) |
| `apps/desktop/src/renderer/components/BookmarkTicker.tsx` | 하단 ticker — 북마크 제목 흐름, 클릭 시 열기 |
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

### INSERT 시 user_id 필수

- Supabase RLS 정책이 `auth.uid() = user_id` 조건으로 동작
- `supabase.from('bookmarks').insert(...)` 시 반드시 `user_id: user.id` 포함

---

## DB 스키마 요약

```sql
categories (id, user_id, name, color, created_at)
bookmarks  (id, user_id, url, title, description, thumbnail,
            category_id, note, tags[], is_favorite, date_saved)
```

- RLS: 각 유저는 자신의 행만 접근 가능
- `is_favorite`: `ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;`

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

컬러: `--bg: #E9E3FF`, `--border: #4A425F`, `--accent: #C8B8FF`, `--text: #2E2A3A`  
폰트: `Courier New` (모든 요소)  
테두리: 항상 직각 (`border-radius: 0 !important`)

---

## 크롬 확장앱 탭 구조

```
[💾 Save] [📋 All] [⭐ Fav] [🗂 Cat]
```

- **Save**: 현재 탭 URL 자동 추출, 카테고리/태그/메모 입력 후 저장
- **All**: 전체 북마크 목록, 검색, 즐겨찾기 토글, 삭제, 클릭시 URL 열기
- **Fav**: `is_favorite=true` 필터된 목록
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

## 향후 작업

- 북마크 수정 기능 (카테고리, 메모를 목록에서 바로 편집)
- 태그 필터
- Supabase Realtime 구독 (확장앱 저장 → 데스크탑 즉시 반영)

---

## 주의사항

- `.env` 파일은 gitignore됨 — 클론 후 확장앱/데스크탑 각각 생성 필요
- 친구 배포 시 친구 Supabase 키로 빌드 후 `dist` 폴더를 zip으로 전달 (확장앱)
- pnpm v11 사용, `pnpm-workspace.yaml`에 `allowBuilds` 설정 필요 (esbuild, electron, app-builder-bin)
- 데스크탑 앱 `resources/icon.png`은 256×256px 이상이어야 electron-builder가 정상 동작
