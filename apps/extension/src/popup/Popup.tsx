import { useEffect, useState, useCallback } from 'react'
import { supabase, type Bookmark, type Category, type BookmarkInsert } from '../lib/supabase'
import { extractPageMeta, type PageMeta } from '../lib/metaParser'
import type { User } from '@supabase/supabase-js'

type Tab = 'save' | 'list' | 'favorites' | 'categories'

const PRESET_COLORS = [
  '#C8B8FF', '#FFD6EA', '#B8E8C8', '#FFE8B8',
  '#B8D8F8', '#F8C8B8', '#D8B8F8', '#C8D8B8',
]

// ── 공통: 픽셀 창 프레임 ───────────────────────────────
function PixelWindow({
  tab, setTab, showTabs, children,
}: {
  tab: Tab; setTab: (t: Tab) => void; showTabs: boolean; children: React.ReactNode
}) {
  return (
    <div className="pixel-window">
      <div className="pixel-titlebar">
        <span className="pixel-titlebar-icon">📎</span>
        <span className="pixel-titlebar-title">Today Bookmark v1.0</span>
        <button className="pixel-titlebar-btn">_</button>
        <button className="pixel-titlebar-btn">□</button>
        <button className="pixel-titlebar-btn" onClick={() => window.close()}>×</button>
      </div>

      {showTabs && (
        <div className="pixel-tabs">
          {([
            ['save',       '💾 Save'],
            ['list',       '📋 All'],
            ['favorites',  '⭐ Fav'],
            ['categories', '🗂 Cat'],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              className={`pixel-tab${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {children}
    </div>
  )
}

// ── 즐겨찾기 별 ────────────────────────────────────────
function StarBtn({ active, onClick }: { active: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 14, lineHeight: 1, padding: '0 2px',
        color: active ? '#FFB800' : '#C0B8D8',
        flexShrink: 0,
      }}
      title={active ? '즐겨찾기 해제' : '즐겨찾기'}
    >
      {active ? '★' : '☆'}
    </button>
  )
}

// ── 북마크 목록 ────────────────────────────────────────
function BookmarkListTab({
  bookmarks, categories, favoritesOnly, onToggleFavorite, onDelete,
}: {
  bookmarks: Bookmark[]
  categories: Category[]
  favoritesOnly: boolean
  onToggleFavorite: (b: Bookmark) => void
  onDelete: (b: Bookmark) => void
}) {
  const [search, setSearch] = useState('')

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  const filtered = bookmarks
    .filter((b) => !favoritesOnly || b.is_favorite)
    .filter((b) => {
      if (!search) return true
      const q = search.toLowerCase()
      return b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
    })

  const domain = (url: string) => { try { return new URL(url).hostname } catch { return url } }

  return (
    <div className="pixel-bg" style={{ padding: 8 }}>
      {/* 검색 */}
      <div className="pixel-row">
        <input
          type="text"
          className="pixel-input"
          placeholder="🔍 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#8C80A8', fontSize: 11 }}>
          {favoritesOnly ? '⭐ 즐겨찾기가 없습니다.' : '📋 저장된 북마크가 없습니다.'}
        </div>
      ) : (
        <div className="pixel-list">
          {filtered.map((b) => (
            <div key={b.id} className="pixel-bookmark-item">
              {/* 즐겨찾기 */}
              <StarBtn
                active={b.is_favorite}
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(b) }}
              />

              {/* 썸네일 */}
              <img
                src={b.thumbnail || `https://www.google.com/s2/favicons?domain=${domain(b.url)}&sz=16`}
                alt=""
                style={{ width: 16, height: 16, objectFit: 'cover', flexShrink: 0, marginTop: 1, border: '1px solid var(--border)' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />

              {/* 내용 */}
              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => chrome.tabs.create({ url: b.url })}>
                <div style={{ fontWeight: 'bold', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {b.title || domain(b.url)}
                </div>
                <div style={{ fontSize: 10, color: '#8C80A8', display: 'flex', gap: 4, alignItems: 'center', marginTop: 1 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                    {domain(b.url)}
                  </span>
                  {b.category_id && catMap[b.category_id] && (
                    <span style={{
                      background: catMap[b.category_id].color,
                      border: '1px solid var(--border)',
                      padding: '0 3px',
                      fontSize: 9,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}>
                      {catMap[b.category_id].name}
                    </span>
                  )}
                </div>
              </div>

              {/* 삭제 */}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(b) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C80A8', fontSize: 12, padding: '0 2px', flexShrink: 0 }}
                title="삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="pixel-statusbar" style={{ margin: '8px -8px -8px', fontSize: 10 }}>
        <span>●</span>
        <span>{filtered.length}개 {favoritesOnly ? '즐겨찾기' : '북마크'}</span>
      </div>
    </div>
  )
}

// ── 카테고리 관리 ──────────────────────────────────────
function CategoriesTab({ userId, categories, onRefresh }: {
  userId: string
  categories: Category[]
  onRefresh: () => void
}) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [saving, setSaving] = useState(false)

  const addCategory = async () => {
    if (!newName.trim()) return
    setSaving(true)
    await supabase.from('categories').insert({ user_id: userId, name: newName.trim(), color: newColor })
    setNewName('')
    setNewColor(PRESET_COLORS[0])
    onRefresh()
    setSaving(false)
  }

  const startEdit = (cat: Category) => {
    setEditId(cat.id)
    setEditName(cat.name)
    setEditColor(cat.color)
  }

  const saveEdit = async () => {
    if (!editId || !editName.trim()) return
    await supabase.from('categories').update({ name: editName.trim(), color: editColor }).eq('id', editId)
    setEditId(null)
    onRefresh()
  }

  const deleteCategory = async (id: string) => {
    if (!confirm('카테고리를 삭제하면 해당 북마크의 카테고리가 없어집니다.')) return
    await supabase.from('categories').delete().eq('id', id)
    onRefresh()
  }

  return (
    <div className="pixel-bg" style={{ padding: 8 }}>
      {/* 기존 카테고리 목록 */}
      <div className="pixel-panel" style={{ marginBottom: 8 }}>
        <span className="pixel-panel-title">[ Categories ]</span>
        {categories.length === 0 ? (
          <div style={{ color: '#8C80A8', fontSize: 11, textAlign: 'center', padding: '8px 0' }}>
            카테고리가 없습니다
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {categories.map((cat) =>
              editId === cat.id ? (
                // 편집 모드
                <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid var(--border)', padding: 6, background: '#F0ECFF' }}>
                  <input
                    className="pixel-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                  />
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {PRESET_COLORS.map((c) => (
                      <div
                        key={c}
                        className={`pixel-swatch${editColor === c ? ' selected' : ''}`}
                        style={{ background: c }}
                        onClick={() => setEditColor(c)}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="pixel-btn pixel-btn-primary" style={{ flex: 1, padding: '2px 0' }} onClick={saveEdit}>Save</button>
                    <button className="pixel-btn" style={{ padding: '2px 8px' }} onClick={() => setEditId(null)}>×</button>
                  </div>
                </div>
              ) : (
                // 일반 모드
                <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div className="pixel-swatch" style={{ background: cat.color }} />
                  <span style={{ flex: 1, fontSize: 11 }}>{cat.name}</span>
                  <button className="pixel-btn" style={{ padding: '1px 6px', fontSize: 10 }} onClick={() => startEdit(cat)}>Edit</button>
                  <button className="pixel-btn" style={{ padding: '1px 6px', fontSize: 10, color: '#8C2020' }} onClick={() => deleteCategory(cat.id)}>✕</button>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* 새 카테고리 추가 */}
      <div className="pixel-panel" style={{ marginBottom: 0 }}>
        <span className="pixel-panel-title">[ New Category ]</span>
        <div className="pixel-row">
          <label className="pixel-label">Name:</label>
          <input
            className="pixel-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            placeholder="카테고리 이름"
          />
        </div>
        <div className="pixel-row">
          <label className="pixel-label">Color:</label>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {PRESET_COLORS.map((c) => (
              <div
                key={c}
                className={`pixel-swatch${newColor === c ? ' selected' : ''}`}
                style={{ background: c }}
                onClick={() => setNewColor(c)}
              />
            ))}
          </div>
        </div>
        <button
          className="pixel-btn pixel-btn-primary"
          style={{ width: '100%' }}
          onClick={addCategory}
          disabled={saving || !newName.trim()}
        >
          {saving ? '...' : '[ + Add Category ]'}
        </button>
      </div>
    </div>
  )
}

// ── 저장 폼 ────────────────────────────────────────────
function SaveTab({ user, categories, onSaved }: {
  user: User; categories: Category[]; onSaved: () => void
}) {
  const [meta, setMeta] = useState<PageMeta>({ url: '', title: '', description: '', thumbnail: '' })
  const [categoryId, setCategoryId] = useState<string>('')
  const [note, setNote] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'duplicate' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [metaLoading, setMetaLoading] = useState(true)

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab.id) { setMetaLoading(false); return }
      try {
        const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageMeta })
        if (results[0]?.result) setMeta(results[0].result)
      } catch {
        setMeta({ url: tab.url ?? '', title: tab.title ?? '', description: '', thumbnail: '' })
      } finally {
        setMetaLoading(false)
      }
    })
  }, [])

  const save = async () => {
    if (!meta.url) return
    setStatus('submitting')
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    const bookmark: BookmarkInsert = {
      user_id: user.id, url: meta.url, title: meta.title,
      description: meta.description, thumbnail: meta.thumbnail,
      category_id: categoryId || null, note, tags,
    }
    const { error } = await supabase.from('bookmarks').insert(bookmark)
    if (!error) { setStatus('success'); onSaved(); setTimeout(() => setStatus('idle'), 2000) }
    else if (error.code === '23505') setStatus('duplicate')
    else { setStatus('error'); setErrorMsg(error.message) }
  }

  if (status === 'success') {
    return (
      <div className="pixel-bg">
        <div className="pixel-panel" style={{ marginBottom: 0 }}>
          <span className="pixel-panel-title">[ Save Complete ]</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="pixel-checkbox" style={{ background: '#C8F0D8' }}>✓</div>
            <span>북마크가 저장되었습니다!</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pixel-bg" style={{ padding: 8 }}>
      {meta.thumbnail && !metaLoading && (
        <img src={meta.thumbnail} alt="" className="pixel-thumb"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
      )}

      <div className="pixel-panel">
        <span className="pixel-panel-title">[ Link ]</span>
        <div className="pixel-row">
          <label className="pixel-label">URL:</label>
          {metaLoading
            ? <div style={{ height: 22, background: 'var(--inactive)', border: '1px solid var(--border)' }} />
            : <input type="url" value={meta.url} onChange={(e) => setMeta((m) => ({ ...m, url: e.target.value }))} className="pixel-input" />}
        </div>
        <div className="pixel-row">
          <label className="pixel-label">Title:</label>
          {metaLoading
            ? <div style={{ height: 22, background: 'var(--inactive)', border: '1px solid var(--border)' }} />
            : <input type="text" value={meta.title} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))} className="pixel-input" placeholder="(제목 없음)" />}
        </div>
      </div>

      <div className="pixel-panel">
        <span className="pixel-panel-title">[ Classify ]</span>
        <div className="pixel-row">
          <label className="pixel-label">Category:</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="pixel-input">
            <option value="">— None —</option>
            {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
        </div>
        <div className="pixel-row">
          <label className="pixel-label">Tags: <span style={{ color: '#8C80A8' }}>(쉼표로 구분)</span></label>
          <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="pixel-input" placeholder="react, design, reference" />
        </div>
        <div className="pixel-row">
          <label className="pixel-label">Note:</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="pixel-input" style={{ resize: 'none' }} placeholder="메모..." />
        </div>
      </div>

      {status === 'duplicate' && (
        <div className="pixel-msg pixel-msg-warning" style={{ marginBottom: 8 }}>
          <span>⚠</span><span>이미 저장된 링크입니다.</span>
        </div>
      )}
      {status === 'error' && (
        <div className="pixel-msg pixel-msg-error" style={{ marginBottom: 8 }}>
          <span>✕</span><span>{errorMsg}</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="pixel-btn pixel-btn-primary" onClick={save}
          disabled={status === 'submitting' || metaLoading || !meta.url}>
          {status === 'submitting' ? <><span className="pixel-blink">▮</span> Saving...</> : '[ Save ]'}
        </button>
      </div>
    </div>
  )
}

// ── 로그인 폼 ───────────────────────────────────────────
function AuthForm({ onSuccess }: { onSuccess: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [signupDone, setSignupDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onSuccess(data.user)
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setSignupDone(true)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  if (signupDone) {
    return (
      <div className="pixel-bg">
        <div className="pixel-panel" style={{ marginBottom: 0 }}>
          <span className="pixel-panel-title">[ System Message ]</span>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div className="pixel-checkbox">!</div>
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>이메일을 확인해주세요</div>
              <div style={{ color: '#6B5FA0', lineHeight: 1.5, fontSize: 10 }}>{email}<br />인증 메일이 발송되었습니다.</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="pixel-btn pixel-btn-primary" onClick={() => { setMode('login'); setSignupDone(false) }}>[ OK ]</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pixel-bg">
      <form onSubmit={submit}>
        <div className="pixel-panel">
          <span className="pixel-panel-title">[ {mode === 'login' ? 'Login' : 'New Account'} ]</span>
          <div className="pixel-row">
            <label className="pixel-label">Email:</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="pixel-input" placeholder="user@example.com" />
          </div>
          <div className="pixel-row">
            <label className="pixel-label">Password:</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="pixel-input" placeholder="••••••" />
          </div>
          {error && <div className="pixel-msg pixel-msg-error" style={{ marginTop: 6 }}><span>⚠</span><span>{error}</span></div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" className="pixel-btn" style={{ fontSize: 10, padding: '3px 8px' }}
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? '▶ 회원가입' : '◀ 로그인'}
          </button>
          <button type="submit" disabled={loading} className="pixel-btn pixel-btn-primary">
            {loading ? <><span className="pixel-blink">▮</span> ...</> : mode === 'login' ? '[ Login ]' : '[ Create ]'}
          </button>
        </div>
      </form>
      <div className="pixel-statusbar" style={{ margin: '10px -10px -10px' }}>
        <span>●</span><span>Ready</span>
      </div>
    </div>
  )
}

// ── 메인 Popup ──────────────────────────────────────────
export function Popup() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('save')
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [categories, setCategories] = useState<Category[]>([])

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
    if (bRes.data) setBookmarks(bRes.data)
    if (cRes.data) setCategories(cRes.data)
  }, [])

  useEffect(() => {
    if (user) loadData()
  }, [user, loadData])

  const toggleFavorite = async (b: Bookmark) => {
    await supabase.from('bookmarks').update({ is_favorite: !b.is_favorite }).eq('id', b.id)
    setBookmarks((prev) => prev.map((x) => x.id === b.id ? { ...x, is_favorite: !b.is_favorite } : x))
  }

  const deleteBookmark = async (b: Bookmark) => {
    if (!confirm(`"${b.title || b.url}" 을 삭제하시겠습니까?`)) return
    await supabase.from('bookmarks').delete().eq('id', b.id)
    setBookmarks((prev) => prev.filter((x) => x.id !== b.id))
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setBookmarks([])
    setCategories([])
  }

  if (loading) {
    return (
      <PixelWindow tab={tab} setTab={setTab} showTabs={false}>
        <div className="pixel-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 60 }}>
          <span className="pixel-blink" style={{ fontSize: 14, letterSpacing: 4 }}>▮▮▮</span>
        </div>
      </PixelWindow>
    )
  }

  if (!user) {
    return (
      <PixelWindow tab={tab} setTab={setTab} showTabs={false}>
        <AuthForm onSuccess={(u) => { setUser(u); loadData() }} />
      </PixelWindow>
    )
  }

  return (
    <PixelWindow tab={tab} setTab={setTab} showTabs={true}>
      {tab === 'save' && (
        <SaveTab user={user} categories={categories} onSaved={loadData} />
      )}
      {(tab === 'list' || tab === 'favorites') && (
        <BookmarkListTab
          bookmarks={bookmarks}
          categories={categories}
          favoritesOnly={tab === 'favorites'}
          onToggleFavorite={toggleFavorite}
          onDelete={deleteBookmark}
        />
      )}
      {tab === 'categories' && (
        <CategoriesTab userId={user.id} categories={categories} onRefresh={loadData} />
      )}
      {/* 하단 로그아웃 */}
      <div className="pixel-statusbar">
        <span style={{ color: '#8C80A8' }}>●</span>
        <span style={{ flex: 1 }}>{user.email}</span>
        <button
          onClick={logout}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#8C80A8', textDecoration: 'underline', fontFamily: 'inherit' }}
        >
          Logout
        </button>
      </div>
    </PixelWindow>
  )
}
