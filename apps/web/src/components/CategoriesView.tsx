import { useState } from 'react'
import { supabase, type Category, type Bookmark } from '../lib/supabase'
import { PRESET_COLORS, getDomain, insertCategory, updateCategory, deleteCategoryById } from '@bookmark-note/shared'

function CategoryForm({ initial, onSave, onCancel }: {
  initial?: { name: string; color: string }
  onSave: (name: string, color: string) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try { await onSave(name.trim(), color) } finally { setSaving(false) }
  }

  return (
    <div style={{ padding: '6px 8px', background: '#F0ECFF', borderBottom: '1px solid var(--border)' }}>
      <div style={{ marginBottom: 5 }}>
        <input className="pixel-input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSave()} placeholder="카테고리 이름" autoFocus />
      </div>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
        {PRESET_COLORS.map((c) => (
          <div key={c} className={`pixel-swatch${color === c ? ' selected' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="pixel-btn pixel-btn-primary" style={{ flex: 1, padding: '3px 0', fontSize: 10 }} onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? '...' : '[ Save ]'}
        </button>
        <button className="pixel-btn" style={{ padding: '3px 10px', fontSize: 10 }} onClick={onCancel}>✕</button>
      </div>
    </div>
  )
}

function CategorySection({ category, bookmarks, isExpanded, isEditing, onToggleExpand, onStartEdit, onSaveEdit, onCancelEdit, onDelete, onSelect }: {
  category: Category | null
  bookmarks: Bookmark[]
  isExpanded: boolean
  isEditing: boolean
  onToggleExpand: () => void
  onStartEdit: () => void
  onSaveEdit: (name: string, color: string) => Promise<void>
  onCancelEdit: () => void
  onDelete: () => void
  onSelect: (b: Bookmark) => void
}) {
  const isUncategorized = category === null

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      {isEditing && !isUncategorized ? (
        <CategoryForm initial={{ name: category!.name, color: category!.color }} onSave={onSaveEdit} onCancel={onCancelEdit} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--win)', cursor: 'pointer' }} onClick={onToggleExpand}>
          <div style={{ width: 10, height: 10, flexShrink: 0, background: isUncategorized ? 'var(--inactive)' : category!.color, border: '1px solid var(--border)' }} />
          <span style={{ flex: 1, fontSize: 11, fontWeight: 'bold' }}>{isUncategorized ? '미분류' : category!.name}</span>
          <span style={{ fontSize: 10, color: '#8C80A8' }}>({bookmarks.length})</span>
          {!isUncategorized && (
            <span style={{ display: 'flex', gap: 3 }} onClick={(e) => e.stopPropagation()}>
              <button className="pixel-btn" style={{ padding: '1px 5px', fontSize: 9 }} onClick={onStartEdit} title="편집">✎</button>
              <button className="pixel-btn" style={{ padding: '1px 5px', fontSize: 9, color: '#8C2020' }} onClick={onDelete} title="삭제">✕</button>
            </span>
          )}
          <span style={{ fontSize: 9, color: '#8C80A8', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
        </div>
      )}

      {isExpanded && (
        <div style={{ background: '#F8F6FF' }}>
          {bookmarks.length === 0 ? (
            <div style={{ padding: '8px 16px', fontSize: 10, color: '#8C80A8' }}>북마크 없음</div>
          ) : (
            bookmarks.map((b) => (
              <div
                key={b.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 16px', borderTop: '1px solid var(--inactive)', cursor: 'pointer' }}
                onClick={() => onSelect(b)}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#EDE8FF')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                <img src={`https://www.google.com/s2/favicons?domain=${getDomain(b.url)}&sz=16`} alt="" style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.8 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                <span style={{ flex: 1, fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title || getDomain(b.url)}</span>
                {b.is_favorite && <span style={{ fontSize: 10, color: '#FFB800', flexShrink: 0 }}>★</span>}
                <span style={{ fontSize: 9, color: '#8C80A8', flexShrink: 0 }}>열기 ↗</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function CategoriesView({ userId, categories, bookmarks, onRefresh, onSelect }: {
  userId: string
  categories: Category[]
  bookmarks: Bookmark[]
  onRefresh: () => void
  onSelect: (b: Bookmark) => void
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const byCategory = Object.fromEntries(categories.map((c) => [c.id, [] as Bookmark[]]))
  const uncategorized: Bookmark[] = []
  for (const b of bookmarks) {
    if (b.category_id && byCategory[b.category_id]) byCategory[b.category_id].push(b)
    else uncategorized.push(b)
  }

  const addCategory = async (name: string, color: string) => {
    try {
      await insertCategory(supabase, userId, name, color)
      setShowAddForm(false)
      onRefresh()
    } catch (err) {
      alert(`카테고리 추가 실패: ${err instanceof Error ? err.message : '오류'}`)
      throw err
    }
  }

  const saveEdit = async (id: string, name: string, color: string) => {
    try {
      await updateCategory(supabase, id, name, color)
      setEditingId(null)
      onRefresh()
    } catch (err) {
      alert(`카테고리 저장 실패: ${err instanceof Error ? err.message : '오류'}`)
      throw err
    }
  }

  const deleteCategory = async (id: string) => {
    if (!confirm('카테고리를 삭제하면 해당 북마크의 카테고리가 없어집니다.')) return
    try {
      await deleteCategoryById(supabase, id)
      onRefresh()
    } catch (err) {
      alert(`카테고리 삭제 실패: ${err instanceof Error ? err.message : '오류'}`)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: 'var(--inactive)', borderBottom: '2px solid var(--border)' }}>
        <span style={{ fontSize: 10, fontWeight: 'bold' }}>🗂 카테고리 ({categories.length})</span>
        <button className="pixel-btn pixel-btn-primary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => { setShowAddForm((v) => !v); setEditingId(null) }}>
          {showAddForm ? '✕ 닫기' : '+ New'}
        </button>
      </div>

      {showAddForm && <CategoryForm onSave={addCategory} onCancel={() => setShowAddForm(false)} />}

      {categories.map((cat) => (
        <CategorySection
          key={cat.id} category={cat} bookmarks={byCategory[cat.id] ?? []}
          isExpanded={expandedIds.has(cat.id)} isEditing={editingId === cat.id}
          onToggleExpand={() => toggleExpand(cat.id)}
          onStartEdit={() => { setEditingId(cat.id); setShowAddForm(false) }}
          onSaveEdit={(name, color) => saveEdit(cat.id, name, color)}
          onCancelEdit={() => setEditingId(null)}
          onDelete={() => deleteCategory(cat.id)}
          onSelect={onSelect}
        />
      ))}

      <CategorySection
        category={null} bookmarks={uncategorized}
        isExpanded={expandedIds.has('uncategorized')} isEditing={false}
        onToggleExpand={() => toggleExpand('uncategorized')}
        onStartEdit={() => {}} onSaveEdit={async () => {}} onCancelEdit={() => {}} onDelete={() => {}}
        onSelect={onSelect}
      />
    </div>
  )
}
