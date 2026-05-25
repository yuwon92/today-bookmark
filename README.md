# Today Bookmark

어떤 사이트든 링크를 저장하고 카테고리로 정리하는 크롬 확장앱.  
레트로 픽셀 OS / 파스텔 라벤더 스타일의 UI를 가진 개인 북마크 관리 도구입니다.

![UI Preview](apps/extension/icons/icon128.png)

---

## 주요 기능

- 🔖 **링크 저장** — 현재 탭의 URL, 제목, 썸네일(og:image)을 자동으로 가져와 저장
- 📋 **북마크 목록** — 저장된 링크를 검색하고 탐색
- ⭐ **즐겨찾기** — 자주 보는 북마크 별도 관리
- 🗂 **카테고리** — 색상과 함께 카테고리 생성/수정/삭제
- 🔐 **계정 기반** — 이메일 로그인, 내 데이터만 보임 (RLS 적용)
- ☁️ **클라우드 동기화** — Supabase 실시간 DB

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 크롬 확장앱 | Manifest V3 + React 19 + TypeScript |
| 빌드 도구 | Vite + @crxjs/vite-plugin |
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
4. `apps/extension/.env.example`을 복사해 `.env` 생성

```bash
cp apps/extension/.env.example apps/extension/.env
```

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

### 개발 / 빌드

```bash
# 확장앱 개발 (HMR)
pnpm extension:dev

# 확장앱 빌드
pnpm extension:build
```

빌드 후 `apps/extension/dist` 폴더를 크롬에 언팩 설치:
- `chrome://extensions` → 개발자 모드 ON → 압축해제된 확장 프로그램 로드

---

## 프로젝트 구조

```
bookmark-note/
├── apps/
│   └── extension/          # 크롬 확장앱
│       ├── src/
│       │   ├── lib/
│       │   │   ├── supabase.ts       # Supabase 클라이언트 + 타입
│       │   │   └── metaParser.ts     # og 메타데이터 추출
│       │   ├── background/
│       │   │   └── service-worker.ts # 세션 유지
│       │   └── popup/
│       │       ├── Popup.tsx         # 메인 UI (탭 네비게이션)
│       │       └── index.css         # 레트로 픽셀 테마
│       └── icons/                    # 앱 아이콘
├── supabase/
│   └── schema.sql          # DB 스키마
└── FRIEND_GUIDE.md         # 친구 배포 가이드 (git 제외)
```

---

## 라이선스

MIT
