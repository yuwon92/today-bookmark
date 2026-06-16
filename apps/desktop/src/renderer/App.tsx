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
import {
  pickRandom,
  loadBookmarksAndCategories,
  toggleFavorite as sharedToggleFavorite,
  updateBookmark as sharedUpdateBookmark,
  deleteBookmarkById,
} from '@bookmark-note/shared'

const RANDOM_ROTATE_MS = 30_000

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
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
    try {
      const { bookmarks: bData, categories: cData } = await loadBookmarksAndCategories(supabase)
      setBookmarks(bData)
      setBannerBookmark((prev) => prev ?? pickRandom(bData))
      setCategories(cData)
    } catch (err) {
      alert(`데이터 로드 실패: ${err instanceof Error ? err.message : '오류'}`)
    }
  }, [])

  useEffect(() => {
    if (user) loadData()
  }, [user, loadData])

  const rerollBanner = useCallback(() => {
    setBannerBookmark((prev) => pickRandom(bookmarks, prev?.id))
  }, [bookmarks])

  useEffect(() => {
    if (bookmarks.length < 2) return
    const timer = window.setInterval(rerollBanner, RANDOM_ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [bookmarks.length, rerollBanner])

  useEffect(() => {
    if (!selectedBookmark) return
    const latest = bookmarks.find((b) => b.id === selectedBookmark.id)
    if (!latest) {
      setSelectedBookmark(null)
      return
    }
    if (latest !== selectedBookmark) setSelectedBookmark(latest)
  }, [bookmarks, selectedBookmark])

  const updateBookmark = async (id: string, changes: Partial<Bookmark>) => {
    try {
      await sharedUpdateBookmark(supabase, id, changes)
      setBookmarks((prev) => prev.map((b) => b.id === id ? { ...b, ...changes } : b))
      setBannerBookmark((prev) => prev?.id === id ? { ...prev, ...changes } : prev)
    } catch (error) {
      alert(`북마크 저장 실패: ${error instanceof Error ? error.message : '오류'}`)
      throw error
    }
  }

  // Supabase Realtime 구독
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`desktop-realtime-${user.id}`)
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
          setBannerBookmark((prev) =>
            prev?.id === payload.new.id ? payload.new as Bookmark : prev
          )
        } else if (payload.eventType === 'DELETE') {
          setBookmarks((prev) => prev.filter((b) => b.id !== (payload.old as Bookmark).id))
          setBannerBookmark((prev) =>
            prev?.id === (payload.old as Bookmark).id ? null : prev
          )
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'categories',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setCategories((prev) => {
            if (prev.some((c) => c.id === payload.new.id)) return prev
            return [...prev, payload.new as Category].sort((a, b) => a.name.localeCompare(b.name))
          })
        } else if (payload.eventType === 'UPDATE') {
          setCategories((prev) =>
            prev
              .map((c) => c.id === payload.new.id ? payload.new as Category : c)
              .sort((a, b) => a.name.localeCompare(b.name))
          )
        } else if (payload.eventType === 'DELETE') {
          setCategories((prev) => prev.filter((c) => c.id !== (payload.old as Category).id))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  const toggleFavorite = async (b: Bookmark) => {
    try {
      await sharedToggleFavorite(supabase, b)
      const nextFavorite = !b.is_favorite
      setBookmarks((prev) =>
        prev.map((x) => x.id === b.id ? { ...x, is_favorite: nextFavorite } : x)
      )
      setBannerBookmark((prev) => prev?.id === b.id ? { ...prev, is_favorite: nextFavorite } : prev)
    } catch (error) {
      alert(`즐겨찾기 변경 실패: ${error instanceof Error ? error.message : '오류'}`)
    }
  }

  const deleteBookmark = async (b: Bookmark) => {
    if (!confirm(`"${b.title || b.url}" 을 삭제하시겠습니까?`)) return
    try {
      await deleteBookmarkById(supabase, b.id)
      setBookmarks((prev) => {
        const next = prev.filter((x) => x.id !== b.id)
        if (bannerBookmark?.id === b.id) setBannerBookmark(pickRandom(next))
        return next
      })
    } catch (error) {
      alert(`북마크 삭제 실패: ${error instanceof Error ? error.message : '오류'}`)
    }
  }

  const logout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      alert(`로그아웃 실패: ${getErrorMessage(error)}`)
      return
    }
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
          <button
            onClick={() => window.electron.openWidget()}
            style={{
              background: 'none', border: '1px solid var(--border)', cursor: 'pointer',
              fontSize: 8, color: '#5A527A', fontFamily: 'inherit',
              padding: '1px 4px', lineHeight: 1,
            }}
            title="위젯 창 열기"
          >
            widget
          </button>
          <button className="pixel-titlebar-btn" onClick={() => window.electron.minimize()}>_</button>
          <button className="pixel-titlebar-btn" onClick={() => window.electron.close()}>×</button>
        </div>
      </div>

      {/* 랜덤 배너 */}
      <RandomBanner
        bookmark={bannerBookmark}
        categories={categories}
        onReroll={rerollBanner}
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
