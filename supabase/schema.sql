-- =============================================
-- Bookmark Notes - Supabase Schema
-- supabase.com 대시보드 > SQL Editor에 붙여넣고 실행하세요
-- =============================================

-- 사용자 정의 카테고리
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  description TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- 북마크 (모든 사이트 링크)
CREATE TABLE bookmarks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  thumbnail   TEXT DEFAULT '',
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  note        TEXT DEFAULT '',
  tags        TEXT[] DEFAULT '{}',
  is_favorite BOOLEAN DEFAULT FALSE,
  date_saved  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, url)
);

-- Row Level Security (각 유저는 자신의 데이터만 접근 가능)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_categories" ON categories
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "own_bookmarks" ON bookmarks
  FOR ALL USING (auth.uid() = user_id);

-- 성능 인덱스
CREATE INDEX idx_bookmarks_user_date ON bookmarks(user_id, date_saved DESC);
CREATE INDEX idx_bookmarks_category  ON bookmarks(category_id);

-- Realtime 활성화 (데스크탑 앱 연동용)
ALTER PUBLICATION supabase_realtime ADD TABLE bookmarks;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;

-- =============================================
-- 마이그레이션 (기존 DB에 적용)
-- =============================================
ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
