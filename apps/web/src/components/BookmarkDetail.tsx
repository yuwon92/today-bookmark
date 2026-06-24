import { useState } from 'react'
import type { Bookmark, Category } from '../lib/supabase'
import { getDomain, parseTag } from '@bookmark-note/shared'

export function BookmarkDetail({
  bookmark, categories, onClose, onSave, onDelete,
}: {
  bookmark: Bookmark
  categories: Category[]
  onClose: () => void
  onSave: (changes: Partial<Bookmark>) => Promise<void>
  onDelete: (b: Bookmark) => void
}) {
  const [title, setTitle] = useState(bookmark.title)
  const [note, setNote] = useState(bookmark.note)
  const [categoryId, setCategoryId] = useState(bookmark.category_id ?? '')
  const [tags, setTags] = useState<string[]>(bookmark.tags)
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)

  const domain = getDomain(bookmark.url)
  const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`

  const addTag = (raw: string) => {
    const trimmed = parseTag(raw)
    if (trimmed && !tags.includes(trimmed)) setTags((prev) => [...prev, trimmed])
    setTagInput('')
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) }
    else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) setTags((prev) => prev.slice(0, -1))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ title, note, category_id: categoryId || null, tags })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pixel-detail-overlay">
      <div className="pixel-detail-header">
        <button className="pixel-btn" style={{ padding: '2px 8px', fontSize: 10 }} onClick={onClose}>← 뒤로</button>
        <span style={{ flex: 1 }} />
        <button
          className="pixel-btn pixel-btn-primary"
          style={{ padding: '2px 8px', fontSize: 10 }}
          onClick={() => window.open(bookmark.url, '_blank', 'noopener,noreferrer')}
        >
          열기 ↗
        </button>
        <button
          className="pixel-btn"
          style={{ padding: '2px 8px', fontSize: 10, color: '#8C2020' }}
          onClick={() => onDelete(bookmark)}
        >
          ✕ 삭제
        </button>
      </div>

      <div className="pixel-detail-section" style={{ background: 'var(--win)', textAlign: 'center', padding: '12px 10px' }}>
        {bookmark.thumbnail ? (
          <img src={bookmark.thumbnail} alt="" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', border: '1px solid var(--border)' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <img src={favicon} alt="" style={{ width: 48, height: 48, border: '1px solid var(--border)', background: 'var(--inactive)', padding: 8 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        )}
      </div>

      <div className="pixel-detail-section">
        <div style={{ marginBottom: 6 }}>
          <label className="pixel-label" style={{ fontSize: 10, color: '#8C80A8' }}>제목</label>
          <input className="pixel-input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ fontSize: 11 }} />
        </div>
        <div
          style={{ fontSize: 10, color: '#8C80A8', cursor: 'pointer', textDecoration: 'underline' }}
          onClick={() => window.open(bookmark.url, '_blank', 'noopener,noreferrer')}
          title={bookmark.url}
        >
          {domain}
        </div>
      </div>

      <div className="pixel-detail-section">
        <label className="pixel-label" style={{ fontSize: 10, color: '#8C80A8' }}>카테고리</label>
        <select className="pixel-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ fontSize: 11 }}>
          <option value="">없음</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="pixel-detail-section">
        <label className="pixel-label" style={{ fontSize: 10, color: '#8C80A8' }}>태그</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 5 }}>
          {tags.map((tag) => (
            <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: 'var(--accent)', border: '1px solid var(--border)', padding: '0 4px', fontSize: 9, lineHeight: '16px' }}>
              #{tag}
              <button onClick={() => setTags((prev) => prev.filter((t) => t !== tag))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 9, color: '#4A425F', lineHeight: 1 }}>✕</button>
            </span>
          ))}
        </div>
        <input
          className="pixel-input" value={tagInput}
          onChange={(e) => { const v = e.target.value; if (v.endsWith(',')) { addTag(v); return } setTagInput(v) }}
          onKeyDown={handleTagKeyDown}
          placeholder="태그 입력 후 Enter 또는 ," style={{ fontSize: 10 }}
        />
      </div>

      <div className="pixel-detail-section">
        <label className="pixel-label" style={{ fontSize: 10, color: '#8C80A8' }}>메모</label>
        <textarea className="pixel-input" value={note} onChange={(e) => setNote(e.target.value)} rows={4} style={{ fontSize: 11, resize: 'none', height: 'auto' }} />
      </div>

      <div style={{ padding: '10px', flexShrink: 0 }}>
        <button className="pixel-btn pixel-btn-primary" style={{ width: '100%', fontSize: 11, padding: '5px 0' }} onClick={handleSave} disabled={saving}>
          {saving ? '...' : '[ 저장 ]'}
        </button>
      </div>
    </div>
  )
}
