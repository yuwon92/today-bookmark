# Today Bookmark

어떤 사이트든 링크를 저장하고 카테고리로 정리하는 북마크 관리 도구.  
**크롬 확장앱** + **Electron 데스크탑 앱** 두 클라이언트가 같은 Supabase 백엔드를 공유합니다.  
레트로 픽셀 OS / 파스텔 라벤더 스타일의 UI를 가집니다.

![UI Preview](apps/extension/icons/icon128.png)

---

## 주요 기능

- 🔖 **링크 저장** — 현재 탭의 URL, 제목, 썸네일(og:image)을 자동으로 가져와 저장 (확장앱)
- 🤖 **AI 자동 추천** — 저장 시 Claude API가 기존 카테고리·태그 기반으로 자동 추천 (확장앱)
- 📋 **북마크 목록** — 저장된 링크를 검색하고 탐색, 태그 칩 클릭으로 필터링
- 🔍 **상세 패널** — 북마크 클릭 시 상세 패널 열림, 제목/카테고리/태그/메모 인라인 수정
- ⭐ **즐겨찾기** — 자주 보는 북마크 별도 관리
- 🗂 **카테고리** — 색상과 함께 카테고리 생성/수정/삭제, 카테고리별 북마크 목록
- 🎲 **오늘의 추천** — 앱 열 때 랜덤 북마크 배너 표시 (데스크탑)
- 📺 **북마크 ticker** — 하단 지하철 광고처럼 북마크 제목이 흐름 (데스크탑)
- ⚡ **실시간 동기화** — Supabase Realtime으로 확장앱 저장 시 데스크탑 즉시 반영
- 🔐 **계정 기반** — 이메일 로그인, 내 데이터만 보임 (RLS 적용)

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 크롬 확장앱 | Manifest V3 + React 19 + TypeScript |
| 데스크탑 앱 | Electron 34 + React 19 + TypeScript (electron-vite) |
| 빌드 도구 | Vite + @crxjs/vite-plugin / electron-vite |
| 패키지 배포 | electron-builder (NSIS 설치 파일) |
| 백엔드/DB | Supabase (PostgreSQL + Auth + RLS) |
| 스타일 | Tailwind CSS v4 + 커스텀 픽셀 CSS |
| 패키지 매니저 | pnpm (workspaces) |

---

## UI 디자인

**레트로 픽셀 OS / 파스텔 라벤더** 컨셉

- 컬러: `#E9E3FF` `#C8B8FF` `#4A425F` `#FFD6EA`
- 폰트: Courier New (monospace)
- 스타일: 1-2px 직각 테두리, bevel 버튼, dot 패턴 배경, 90s GUI

---

## 시작하기

### 필요 환경

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Supabase 계정 (무료)

### 설치

```bash
git clone https://github.com/your-id/today-bookmark.git
cd today-bookmark
pnpm install
```

### Supabase 설정

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성
2. **SQL Editor**에서 `supabase/schema.sql` 실행
3. **Authentication > Providers > Email** → `Confirm email` OFF
4. `.env.example`을 복사해 `.env` 생성 (확장앱 / 데스크탑 각각)

```bash
cp apps/extension/.env.example apps/extension/.env
cp apps/desktop/.env.example   apps/desktop/.env
```

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
VITE_CLAUDE_API_KEY=sk-ant-...   # 확장앱 전용, AI 추천 기능 (없으면 기능만 비활성)
```

5. Supabase Realtime 활성화 (실시간 동기화 사용 시)
   - Supabase 대시보드 → **Database → Publications**
   - `supabase_realtime` → `bookmarks` 테이블 토글 ON

---

## 크롬 확장앱

### 개발 / 빌드

```bash
pnpm extension:dev    # 개발 서버 (HMR)
pnpm extension:build  # 빌드 → apps/extension/dist/
```

빌드 후 `apps/extension/dist` 폴더를 크롬에 언팩 설치:
- `chrome://extensions` → 개발자 모드 ON → 압축해제된 확장 프로그램 로드

### 탭 구조

```
[💾 Save] [📋 All] [⭐ Fav] [🗂 Cat]
```

- **Save** — 현재 탭 URL 자동 추출, 카테고리/태그/메모 저장. Claude AI가 기존 카테고리·태그 기반으로 자동 추천
- **All / Fav** — 북마크 검색/탐색. 단일클릭 → 상세 뷰 / 더블클릭 → 탭으로 열기. 태그 칩 클릭으로 필터링
- **Cat** — 카테고리 CRUD

---

## 데스크탑 앱

### 개발 / 빌드 / 패키징

```bash
pnpm desktop:dev    # 개발 서버 (Electron HMR)
pnpm desktop:build  # 빌드만
pnpm desktop:dist   # 빌드 + .exe 설치 파일 생성 → apps/desktop/dist/
```

### 화면 구성

- **상단** — 커스텀 타이틀바 (드래그 이동, 최소화/닫기)
- **배너** — 앱 열 때 랜덤 북마크 1개 표시, 🔀 버튼으로 다른 북마크 보기
- **목록** — 검색 + 북마크 리스트. 단일클릭 → 상세 패널 / 더블클릭 → 브라우저에서 열기
- **상세 패널** — 제목·카테고리·태그·메모 수정 후 저장. Supabase Realtime으로 즉시 반영
- **하단 탭** — All / Fav / Cat
- **ticker** — 저장된 북마크 제목이 옆으로 흐름 (클릭 시 열기)

### 창 크기

420 × 860px 고정 (세로형 모바일 비율)

---

## 프로젝트 구조

```
bookmark-note/
├── apps/
│   ├── extension/              # 크롬 확장앱
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── supabase.ts         # Supabase 클라이언트 + 타입
│   │   │   │   ├── claude.ts           # Claude API 자동 추천
│   │   │   │   └── metaParser.ts       # og 메타데이터 추출
│   │   │   ├── background/
│   │   │   │   └── service-worker.ts   # 세션 유지 (25분 주기)
│   │   │   └── popup/
│   │   │       ├── Popup.tsx           # 메인 UI
│   │   │       └── index.css           # 레트로 픽셀 테마
│   │   ├── manifest.json
│   │   └── icons/
│   │
│   └── desktop/                # Electron 데스크탑 앱
│       ├── electron.vite.config.ts
│       ├── resources/
│       │   └── icon.png                # 앱 아이콘 (256x256 이상)
│       └── src/
│           ├── main/
│           │   └── index.ts            # BrowserWindow, IPC 핸들러
│           ├── preload/
│           │   └── index.ts            # contextBridge API
│           └── renderer/
│               ├── App.tsx             # 메인 레이아웃 + 상태 관리
│               ├── lib/supabase.ts     # Supabase 클라이언트 (localStorage 세션)
│               └── components/
│                   ├── AuthForm.tsx
│                   ├── RandomBanner.tsx
│                   ├── BookmarkList.tsx
│                   ├── BookmarkItem.tsx    # 단일/더블클릭 분리
│                   ├── BookmarkDetail.tsx  # 상세 패널 (인라인 편집)
│                   ├── CategoriesView.tsx
│                   ├── BottomNav.tsx
│                   └── BookmarkTicker.tsx
│
├── supabase/
│   └── schema.sql              # DB 스키마
└── FRIEND_GUIDE.md             # 친구 배포 가이드 (git 제외)
```

---

## 라이선스

MIT
