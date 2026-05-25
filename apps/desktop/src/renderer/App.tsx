import { useCallback, useEffect, useState } from 'react'
import { supabase, type Bookmark, type Category } from './lib/supabase'
import type { User } from '@supabase/supabase-js'
import { AuthForm } from './components/AuthForm'
import { RandomBanner } from './components/RandomBanner'
import { BookmarkList } from './components/BookmarkList'
import { BookmarkTicker } from './components/BookmarkTicker'
import { BottomNav, type DesktopTab } from './components/BottomNav'
import { CategoriesView } from './components/CategoriesView'
import { BookmarkDetail } from './components/BookmarkDetail'

function pickRandom(bookmarks: Bookmark[]): Bookmark | null {
  if (bookmarks.length === 0) return null
  return bookmarks[Math.floor(Math.random() * bookmarks.length)]
}

export function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<DesktopTab>('all')
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [bannerBookmark, setBannerBookmark] = useState<Bookmark | null>(null)
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(null)

  // 초기 인증 확인
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
  }, [])

  const loadData = useCallback(async () => {
    const [bRes, cRes] = await Promise.all([
      supabase.from('bookmarks').select('*').order('date_saved', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
    ])
    if (bRes.data) {
      setBookmarks(bRes.data)
      setBannerBookmark((prev) => prev ?? pickRandom(bRes.data!))
    }
    if (cRes.data) setCategories(cRes.data)
  }, [])

  useEffect(() => {
    if (user) loadData()
  }, [user, loadData])

  const updateBookmark = async (id: string, changes: Partial<Bookmark>) => {
    await supabase.from('bookmarks').update(changes).eq('id', id)
    setBookmarks((prev) => prev.map((b) => b.id === id ? { ...b, ...changes } : b))
  }

  // Supabase Realtime 구독
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('bookmarks-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookmarks',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setBookmarks((prev) => [payload.new as Bookmark, ...prev])
          setBannerBookmark((prev) => prev ?? (payload.new as Bookmark))
        } else if (payload.eventType === 'UPDATE') {
          setBookmarks((prev) =>
            prev.map((b) => b.id === payload.new.id ? payload.new as Bookmark : b)
          )
        } else if (payload.eventType === 'DELETE') {
          setBookmarks((prev) => prev.filter((b) => b.id !== (payload.old as Bookmark).id))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  const toggleFavorite = async (b: Bookmark) => {
    await supabase.from('bookmarks').update({ is_favorite: !b.is_favorite }).eq('id', b.id)
    setBookmarks((prev) =>
      prev.map((x) => x.id === b.id ? { ...x, is_favorite: !b.is_favorite } : x)
    )
  }

  const deleteBookmark = async (b: Bookmark) => {
    if (!confirm(`"${b.title || b.url}" 을 삭제하시겠습니까?`)) return
    await supabase.from('bookmarks').delete().eq('id', b.id)
    setBookmarks((prev) => {
      const next = prev.filter((x) => x.id !== b.id)
      // 배너가 삭제된 북마크이면 교체
      if (bannerBookmark?.id === b.id) setBannerBookmark(pickRandom(next))
      return next
    })
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setBookmarks([])
    setCategories([])
    setBannerBookmark(null)
  }

  // ── 로딩 화면 ──────────────────────────────
  if (loading) {
    return (
      <div className="desktop-root">
        <div className="pixel-titlebar">
          <span className="pixel-titlebar-icon">📎</span>
          <span className="pixel-titlebar-title">Today Bookmark</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="pixel-blink" style={{ fontSize: 18, letterSpacing: 6 }}>▮▮▮</span>
        </div>
      </div>
    )
  }

  // ── 로그인 화면 ─────────────────────────────
  if (!user) {
    return (
      <div className="desktop-root">
        <div className="pixel-titlebar">
          <span className="pixel-titlebar-icon">📎</span>
          <span className="pixel-titlebar-title">Today Bookmark</span>
          <div className="pixel-titlebar-controls">
            <button className="pixel-titlebar-btn" onClick={() => window.electron.minimize()}>_</button>
            <button className="pixel-titlebar-btn" onClick={() => window.electron.close()}>×</button>
          </div>
        </div>
        <AuthForm onSuccess={(u) => { setUser(u); loadData() }} />
      </div>
    )
  }

  // ── 메인 화면 ──────────────────────────────
  return (
    <div className="desktop-root">
      {/* 타이틀바 */}
      <div className="pixel-titlebar">
        <span className="pixel-titlebar-icon">📎</span>
        <span className="pixel-titlebar-title">Today Bookmark</span>
        <div className="pixel-titlebar-controls" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: '#5A527A', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </span>
          <button
            onClick={logout}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 9, color: '#5A527A', fontFamily: 'inherit',
              textDecoration: 'underline', padding: 0,
            }}
          >
            logout
          </button>
          <button className="pixel-titlebar-btn" onClick={() => window.electron.minimize()}>_</button>
          <button className="pixel-titlebar-btn" onClick={() => window.electron.close()}>×</button>
        </div>
      </div>

      {/* 랜덤 배너 */}
      <RandomBanner
        bookmark={bannerBookmark}
        onReroll={() => setBannerBookmark(pickRandom(bookmarks))}
      />

      {/* 메인 컨텐츠 */}
      <div className="desktop-content">
        {/* 북마크 상세 패널 오버레이 */}
        {selectedBookmark && (
          <BookmarkDetail
            bookmark={selectedBookmark}
            categories={categories}
            onClose={() => setSelectedBookmark(null)}
            onSave={(changes) => updateBookmark(selectedBookmark.id, changes)}
            onDelete={(b) => { deleteBookmark(b); setSelectedBookmark(null) }}
          />
        )}
        {/* 검색창 (카테고리 탭 제외) */}
        {tab !== 'categories' && (
          <div className="desktop-search-wrap">
            <input
              type="text"
              className="pixel-input"
              placeholder="🔍 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}

        {/* 탭 컨텐츠 */}
        <div className="desktop-scroll">
          {tab === 'all' && (
            <BookmarkList
              bookmarks={bookmarks}
              categories={categories}
              search={search}
              favoritesOnly={false}
              activeTag={activeTag}
              onToggleFavorite={toggleFavorite}
              onDelete={deleteBookmark}
              onTagClick={(tag) => setActiveTag((prev) => (prev === tag ? null : tag))}
              onSelect={setSelectedBookmark}
            />
          )}
          {tab === 'favorites' && (
            <BookmarkList
              bookmarks={bookmarks}
              categories={categories}
              search={search}
              favoritesOnly={true}
              activeTag={activeTag}
              onToggleFavorite={toggleFavorite}
              onDelete={deleteBookmark}
              onTagClick={(tag) => setActiveTag((prev) => (prev === tag ? null : tag))}
              onSelect={setSelectedBookmark}
            />
          )}
          {tab === 'categories' && (
            <CategoriesView
              userId={user.id}
              categories={categories}
              bookmarks={bookmarks}
              onRefresh={loadData}
              onSelect={setSelectedBookmark}
            />
          )}
        </div>
      </div>

      {/* 하단 네비게이션 */}
      <BottomNav
        tab={tab}
        setTab={(t) => { setTab(t); setActiveTag(null); setSearch('') }}
      />

      {/* 지하철 광고 ticker */}
      <BookmarkTicker bookmarks={bookmarks} />
    </div>
  )
}
