# 링크 북마크 정리 앱 — 구현 계획

## 개요

어떤 사이트든 링크를 저장하고 카테고리로 정리하는 앱.
크롬 확장앱에서 저장 → 데스크탑 앱에서 관리. 계정 기반 클라우드 동기화.

**핵심 흐름**
1. 확장앱 클릭 → 로그인 (최초 1회)
2. 현재 탭 URL 자동 입력 + og 메타데이터 자동 추출
3. 카테고리/태그 선택 → 저장 → Supabase에 저장
4. 데스크탑 앱에서 실시간으로 나타남, 검색/필터/메모 관리

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 백엔드/DB/인증 | Supabase (PostgreSQL + Auth + Realtime) |
| 데스크탑 앱 | Electron 42 + React + TypeScript (electron-vite) |
| 크롬 확장앱 | Manifest V3 + React + Vite + @crxjs/vite-plugin |
| UI | Tailwind CSS v4 |
| 상태관리 | Zustand (데스크탑) |

---

## 프로젝트 구조

```
bookmark-note/
├── package.json                  # 루트 (pnpm workspaces)
├── pnpm-workspace.yaml
├── supabase/
│   └── schema.sql                # DB 스키마 (Supabase에서 실행)
└── apps/
    ├── extension/                # 크롬 확장앱 ✅ (완료)
    │   ├── manifest.json
    │   ├── vite.config.ts
    │   ├── package.json
    │   └── src/
    │       ├── lib/
    │       │   ├── supabase.ts   # Supabase 클라이언트 + 타입
    │       │   └── metaParser.ts # og 메타데이터 추출
    │       ├── background/
    │       │   └── service-worker.ts
    │       └── popup/
    │           ├── popup.html
    │           ├── main.tsx
    │           ├── index.css
    │           └── Popup.tsx     # 로그인 폼 + 저장 폼
    └── desktop/                  # 데스크탑 앱 (미구현)
        └── ...
```

---

## Supabase 스키마

```sql
-- 카테고리 (사용자 정의)
CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- 북마크
CREATE TABLE bookmarks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  thumbnail   TEXT DEFAULT '',      -- og:image URL
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  note        TEXT DEFAULT '',
  tags        TEXT[] DEFAULT '{}',
  date_saved  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, url)
);
```

---

## 크롬 확장앱 팝업 흐름

```
앱 실행
  ↓
세션 확인 (chrome.storage.local)
  ├─ 없음 → [로그인 폼] 이메일/패스워드 입력
  └─ 있음 → [저장 폼]
              ├─ 현재 탭 URL + 제목 + 썸네일 자동 추출
              ├─ 카테고리 드롭다운 (Supabase에서 로드)
              ├─ 태그 입력 (쉼표 구분)
              ├─ 메모 입력
              └─ [저장] → Supabase insert → "✅ 저장됨" → 자동 닫힘
```

---

## 구현 순서

### Phase 1 — Supabase 설정 (수동)
- [ ] supabase.com 무료 계정 생성
- [ ] 새 프로젝트 생성 (지역: Northeast Asia)
- [ ] SQL Editor에서 `supabase/schema.sql` 실행
- [ ] Settings > API에서 URL과 anon key 복사
- [ ] `apps/extension/.env` 파일 생성 (.env.example 참고)

### Phase 2 — 크롬 확장앱 ✅ 완료
- [x] 프로젝트 스캐폴드 (Vite + CRXJS + React)
- [x] Supabase 클라이언트 (chrome.storage 기반 세션)
- [x] og 메타데이터 추출 (metaParser.ts)
- [x] Background service worker (세션 갱신)
- [x] 팝업 UI (로그인 폼 + 저장 폼)
- [x] 빌드 확인

### Phase 3 — 크롬에 확장앱 설치 (수동)
- [ ] `pnpm extension:build` 실행
- [ ] Chrome > 확장 프로그램 > 개발자 모드 ON
- [ ] "압축 해제된 확장 프로그램 로드" → `apps/extension/dist` 폴더 선택

### Phase 4 — 데스크탑 앱 (미구현)
- [ ] electron-vite 스캐폴드
- [ ] Supabase 클라이언트 (electron-store 기반 세션)
- [ ] IPC: auth, bookmark, category
- [ ] UI: 로그인 → 사이드바 + 북마크 그리드 + 상세 모달
- [ ] Realtime 구독 (확장앱 저장 시 즉시 반영)

---

## 비용

| 항목 | 비용 |
|------|------|
| Supabase | 무료 (500MB DB, MAU 50,000) |
| 데스크탑 앱 (개인 사용) | 무료 |
| 크롬 확장앱 (비공개) | 무료 |
| 크롬 웹스토어 출시 | $5 (1회, 선택) |

> Supabase 무료 플랜: 7일간 미접속 시 프로젝트 일시정지 → 대시보드에서 복원 가능

---

## 유지보수

| 주기 | 할 일 |
|------|------|
| 월 1회 | `npm outdated`로 보안 업데이트 확인 |
| 브라우저 업데이트 후 | 확장앱 동작 확인 |
| og 파싱 깨질 때 | metaParser.ts 선택자 수정 |

---

## UI 디자인 가이드

### 컨셉
**레트로 픽셀 OS / 파스텔 라벤더 / 1990s 작은 데스크톱 창**

키워드: retro pixel UI, pastel lavender, soft purple, pixel window, old computer OS,
tiny desktop app, cute but minimal, low-resolution interface, monochrome pixel outline,
soft dithering, 90s GUI, pixel buttons, nostalgic software, cozy pastel aesthetic

### 컬러 팔레트

| 역할 | 색상 | 코드 |
|------|------|------|
| 메인 배경 | 아주 연한 라벤더 | `#E9E3FF` |
| 창 배경 | 거의 흰색에 가까운 연보라 | `#F8F6FF` |
| 테두리 | 어두운 보라빛 회색 | `#4A425F` |
| 강조색 | 파스텔 라벤더 | `#C8B8FF` |
| 보조 강조색 | 연핑크 | `#FFD6EA` |
| 텍스트 | 진한 보라/검정 | `#2E2A3A` |
| 비활성 영역 | 연회색 보라 | `#D8D2EA` |

### UI 스타일 규칙
- 폰트: `Courier New` (monospace) — 레트로 느낌
- 모든 테두리: `1~2px solid #4A425F` — 픽셀아트 느낌의 단단한 선
- 모서리: 둥근 모서리 없음 (`border-radius: 0`) — 직각 박스형
- 버튼: 오래된 OS bevel 효과 — 밝은 좌상단 + 어두운 우하단 inset shadow
- 인풋: 눌린(recessed) 효과 — 어두운 좌상단 + 밝은 우하단 inset shadow
- 배경: 8px 간격 dot 패턴으로 레트로 질감
- 창 구조: 타이틀바(그라디언트) + 콘텐츠 영역
- 타이틀바: 좌측 아이콘+제목, 우측 픽셀 스타일 [_][□][×] 버튼

### CSS 클래스 시스템 (index.css)
```
.pixel-window      — 메인 창 프레임 (2px 테두리)
.pixel-titlebar    — 타이틀바 (그라디언트 배경)
.pixel-titlebar-btn — 닫기/최소화 버튼
.pixel-bg          — dot 패턴 배경
.pixel-panel       — 그룹 박스 (fieldset 느낌)
.pixel-btn         — 일반 버튼 (bevel)
.pixel-btn-primary — 강조 버튼 (라벤더 배경)
.pixel-input       — 텍스트 입력 (recessed)
.pixel-label       — 폼 라벨
.pixel-msg-error   — 에러 메시지 박스
.pixel-msg-warning — 경고 메시지 박스
.pixel-statusbar   — 하단 상태바
```
