export type DesktopTab = 'all' | 'favorites' | 'categories'

const TABS: { id: DesktopTab; icon: string; label: string }[] = [
  { id: 'all',        icon: '📋', label: 'All' },
  { id: 'favorites',  icon: '⭐', label: 'Fav' },
  { id: 'categories', icon: '🗂', label: 'Cat' },
]

export function BottomNav({ tab, setTab }: { tab: DesktopTab; setTab: (t: DesktopTab) => void }) {
  return (
    <nav className="pixel-bottom-nav">
      {TABS.map(({ id, icon, label }) => (
        <button
          key={id}
          className={`pixel-bottom-tab${tab === id ? ' active' : ''}`}
          onClick={() => setTab(id)}
        >
          <span style={{ fontSize: 14 }}>{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
