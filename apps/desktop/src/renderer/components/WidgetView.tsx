import { useEffect, useState } from 'react'
import { supabase, type Bookmark, type Category } from '../lib/supabase'
import { getDomain, pickRandom } from '@bookmark-note/shared'

const WIDGET_ROTATE_MS = 30_000

function formatSavedDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  })
}

export function WidgetView() {
  const [ready, setReady] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [bookmark, setBookmark] = useState<Bookmark | null>(null)
  const [editingNote, setEditingNote] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session?.user) {
        setReady(true)
        return
      }
      setLoggedIn(true)
      Promise.all([
        supabase.from('bookmarks').select('*'),
        supabase.from('categories').select('*'),
      ]).then(([bRes, cRes]) => {
        const list = bRes.data ?? []
        setBookmarks(list)
        setCategories(cRes.data ?? [])
        setBookmark(pickRandom(list))
        setReady(true)
      })
    })
  }, [])

  const reroll = () => {
    const next = pickRandom(bookmarks, bookmark?.id)
    if (next) setBookmark(next)
  }

  useEffect(() => {
    if (!loggedIn || editingNote || bookmarks.length < 2) return
    const timer = window.setInterval(reroll, WIDGET_ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [bookmarks, bookmark?.id, editingNote, loggedIn])

  const updateNote = async (id: string, note: string) => {
    const { error } = await supabase.from('bookmarks').update({ note }).eq('id', id)
    if (error) throw error

    setBookmarks((prev) =>
      prev.map((item) => item.id === id ? { ...item, note } : item)
    )
    setBookmark((prev) => prev && prev.id === id ? { ...prev, note } : prev)
  }

  const category = bookmark
    ? categories.find((c) => c.id === bookmark.category_id)
    : undefined

  return (
    <div className="widget-root">
      <div className="pixel-titlebar">
        <span className="pixel-titlebar-icon">📎</span>
        <span className="pixel-titlebar-title" style={{ fontSize: 10 }}>Bookmark Widget</span>
        <div className="pixel-titlebar-controls">
          {loggedIn && bookmark && (
            <button className="pixel-titlebar-btn" onClick={reroll} title="다른 북마크">
              🔀
            </button>
          )}
          <button className="pixel-titlebar-btn" onClick={() => window.electron.minimize()}>_</button>
          <button className="pixel-titlebar-btn" onClick={() => window.electron.close()}>×</button>
        </div>
      </div>

      {!ready ? (
        <div className="widget-center">
          <span className="pixel-blink">▮▮▮</span>
        </div>
      ) : !loggedIn ? (
        <div className="widget-center">
          <span>🔐 Login in main app</span>
        </div>
      ) : !bookmark ? (
        <div className="widget-center">
          <span style={{ color: '#8C80A8' }}>No bookmarks yet.</span>
        </div>
      ) : (
        <WidgetCard
          bookmark={bookmark}
          category={category}
          totalCount={bookmarks.length}
          onReroll={reroll}
          onUpdateNote={updateNote}
          onEditingNoteChange={setEditingNote}
        />
      )}
    </div>
  )
}

function WidgetCard({
  bookmark,
  category,
  totalCount,
  onReroll,
  onUpdateNote,
  onEditingNoteChange,
}: {
  bookmark: Bookmark
  category: Category | undefined
  totalCount: number
  onReroll: () => void
  onUpdateNote: (id: string, note: string) => Promise<void>
  onEditingNoteChange: (editing: boolean) => void
}) {
  const domain = getDomain(bookmark.url)
  const summary = bookmark.note || bookmark.description || '다시 볼 만한 북마크'
  const savedDate = formatSavedDate(bookmark.date_saved)
  const visibleTags = bookmark.tags.slice(0, 2)
  const hiddenTagCount = Math.max(bookmark.tags.length - visibleTags.length, 0)
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(bookmark.note)
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState('')

  useEffect(() => {
    setNoteDraft(bookmark.note)
    setEditingNote(false)
    onEditingNoteChange(false)
    setSavingNote(false)
    setNoteError('')
  }, [bookmark.id, bookmark.note, onEditingNoteChange])

  const saveNote = async () => {
    setSavingNote(true)
    setNoteError('')
    try {
      await onUpdateNote(bookmark.id, noteDraft.trim())
      setEditingNote(false)
      onEditingNoteChange(false)
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : '메모 저장 실패')
    } finally {
      setSavingNote(false)
    }
  }

  const cancelNoteEdit = () => {
    setNoteDraft(bookmark.note)
    setEditingNote(false)
    onEditingNoteChange(false)
    setNoteError('')
  }

  return (
    <div className="widget-body">
      <div
        className="widget-accent"
        style={{ background: category?.color ?? 'var(--accent)' }}
      />

      <div className="widget-ticket-head">
        <span className="widget-kicker">TODAY PICK</span>
        {bookmark.is_favorite && <span className="widget-favorite">★</span>}
      </div>

      <div className="widget-title">{bookmark.title || domain}</div>

      {editingNote ? (
        <div className="widget-note-editor">
          <textarea
            className="widget-note-input"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                cancelNoteEdit()
              }
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                saveNote()
              }
            }}
            placeholder="메모를 남겨두기"
            rows={2}
            autoFocus
          />
          <div className="widget-note-actions">
            {noteError && <span className="widget-note-error">{noteError}</span>}
            <button
              className="pixel-btn"
              style={{ fontSize: 9, padding: '1px 6px' }}
              onClick={cancelNoteEdit}
              disabled={savingNote}
            >
              취소
            </button>
            <button
              className="pixel-btn pixel-btn-primary"
              style={{ fontSize: 9, padding: '1px 7px' }}
              onClick={saveNote}
              disabled={savingNote}
            >
              {savingNote ? '...' : '저장'}
            </button>
          </div>
        </div>
      ) : (
        <button
          className={`widget-summary${bookmark.note ? '' : ' widget-summary-empty'}`}
          onClick={() => {
            setEditingNote(true)
            onEditingNoteChange(true)
          }}
          title="클릭해서 메모 수정"
        >
          {summary}
        </button>
      )}

      <div className="widget-meta">
        {category && (
          <span className="widget-category" style={{ background: category.color }}>
            {category.name}
          </span>
        )}
        {visibleTags.map((tag) => (
          <span key={tag} className="pixel-tag">#{tag}</span>
        ))}
        {hiddenTagCount > 0 && (
          <span className="widget-more-tags">+{hiddenTagCount}</span>
        )}
      </div>

      <div className="widget-footer">
        <div className="widget-footer-info">
          <span className="widget-domain">{domain}</span>
          <span>{totalCount} links</span>
          {savedDate && <span>{savedDate}</span>}
        </div>
        <button
          className="pixel-btn"
          style={{ fontSize: 10, padding: '2px 8px' }}
          onClick={onReroll}
        >
          다음
        </button>
        <button
          className="pixel-btn pixel-btn-primary"
          style={{ fontSize: 10, padding: '2px 10px' }}
          onClick={() => window.electron.openExternal(bookmark.url)}
        >
          열기 ↗
        </button>
      </div>
    </div>
  )
}
