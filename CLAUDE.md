# Today Bookmark — Claude Code 가이드

## 프로젝트 개요

어떤 사이트든 링크를 저장하고 카테고리로 정리하는 **크롬 확장앱**.  
백엔드는 Supabase(PostgreSQL + Auth + RLS), UI는 레트로 픽셀 OS 스타일.

현재 크롬 확장앱만 구현됨. 데스크탑 앱(Electron)은 미구현.

---

## 기술 스택

- **크롬 확장앱**: Manifest V3, React 19, TypeScript, Vite, @crxjs/vite-plugin
- **백엔드**: Supabase (PostgreSQL, Auth, Row Level Security)
- **스타일**: Tailwind CSS v4 + 커스텀 레트로 픽셀 CSS
- **패키지**: pnpm workspaces

---

## 핵심 명령어

```bash
pnpm extension:dev      # 확장앱 개발 서버 (HMR)
pnpm extension:build    # 확장앱 빌드 → apps/extension/dist/
pnpm install            # 전체 의존성 설치
```

---

## 주요 파일 경로

| 파일 | 역할 |
|------|------|
| `apps/extension/src/popup/Popup.tsx` | 메인 UI — 탭(Save/All/Fav/Categories), 저장폼, 목록, 카테고리 CRUD |
| `apps/extension/src/popup/index.css` | 레트로 픽셀 CSS 테마 전체 |
| `apps/extension/src/lib/supabase.ts` | Supabase 클라이언트 + 공유 타입 정의 |
| `apps/extension/src/lib/metaParser.ts` | 페이지 og 메타데이터 추출 함수 (executeScript에 주입) |
| `apps/extension/src/background/service-worker.ts` | 25분마다 Supabase 세션 갱신 |
| `apps/extension/manifest.json` | MV3 manifest — 권한, 팝업, 아이콘 경로 |
| `apps/extension/.env` | Supabase URL + 키 (gitignore됨, 직접 생성 필요) |
| `supabase/schema.sql` | DB 스키마 (categories, bookmarks 테이블 + RLS + 인덱스) |

---

## 아키텍처 핵심

### Supabase 인증
- `chrome.storage.local` 기반 커스텀 스토리지 어댑터 사용
- 기본 `localStorage`는 service worker에서 동작 안 함
- `src/lib/supabase.ts`의 `chromeStorage` 객체가 처리

### 메타데이터 추출
- `chrome.scripting.executeScript`로 `extractPageMeta` 함수를 현재 탭에 주입
- 함수가 외부 import 없이 완전히 독립적이어야 함 (직렬화되어 전송)

### INSERT 시 user_id 필수
- Supabase RLS 정책이 `auth.uid() = user_id` 조건으로 동작
- `supabase.from('bookmarks').insert(...)` 시 반드시 `user_id: user.id` 포함

### 아이콘 경로
- `apps/extension/icons/` 폴더에 PNG 파일 위치
- `manifest.json`에서 `icons/icon16.png` 등으로 참조

---

## DB 스키마 요약

```sql
categories (id, user_id, name, color, created_at)
bookmarks  (id, user_id, url, title, description, thumbnail,
            category_id, note, tags[], is_favorite, date_saved)
```

- RLS: 각 유저는 자신의 행만 접근 가능
- `is_favorite`: `ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;` 로 추가됨 (schema.sql에 포함)

---

## UI 디자인 시스템

**레트로 픽셀 OS / 파스텔 라벤더** 컨셉 (`index.css`)

| CSS 클래스 | 역할 |
|-----------|------|
| `.pixel-window` | 메인 창 프레임 (2px 테두리) |
| `.pixel-titlebar` | 라벤더 그라디언트 타이틀바 |
| `.pixel-bg` | dot 패턴 배경 (#E9E3FF) |
| `.pixel-panel` | 그룹 박스 |
| `.pixel-btn` | bevel 버튼 (inset shadow) |
| `.pixel-btn-primary` | 라벤더 강조 버튼 |
| `.pixel-input` | recessed 인풋 (inset shadow 반전) |
| `.pixel-tabs` / `.pixel-tab` | 탭 네비게이션 |
| `.pixel-list` / `.pixel-bookmark-item` | 북마크 목록 |
| `.pixel-statusbar` | 하단 상태바 |

컬러: `--bg: #E9E3FF`, `--border: #4A425F`, `--accent: #C8B8FF`, `--text: #2E2A3A`  
폰트: `Courier New` (모든 요소)  
테두리: 항상 직각 (`border-radius: 0 !important`)

---

## 팝업 탭 구조

```
[💾 Save] [📋 All] [⭐ Fav] [🗂 Cat]
```

- **Save**: 현재 탭 URL 자동 추출, 카테고리/태그/메모 입력 후 저장
- **All**: 전체 북마크 목록, 검색, 즐겨찾기 토글, 삭제, 클릭시 URL 열기
- **Fav**: `is_favorite=true` 필터된 목록
- **Cat**: 카테고리 CRUD (색상 8가지 프리셋)

---

## 미구현 (향후 작업)

- `apps/desktop/` — Electron 데스크탑 앱 (Supabase Realtime 구독으로 실시간 동기화)
- 북마크 수정 기능 (카테고리, 메모를 목록에서 바로 편집)
- 태그 필터

---

## 주의사항

- `.env` 파일은 gitignore됨 — 클론 후 직접 생성 필요
- 친구 배포 시 친구 Supabase 키로 빌드 후 `dist` 폴더를 zip으로 전달
- pnpm v11 사용, `pnpm-workspace.yaml`에 `allowBuilds: esbuild: true` 설정 필요
