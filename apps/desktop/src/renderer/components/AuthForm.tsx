import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import appIcon from '../assets/icon.png'

export function AuthForm({ onSuccess }: { onSuccess: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [signupDone, setSignupDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
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
      <div style={{ padding: 20 }}>
        <div className="pixel-panel">
          <span className="pixel-panel-title">[ System Message ]</span>
          <div style={{ marginBottom: 12, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 6 }}>이메일을 확인해주세요</div>
            <div style={{ color: '#6B5FA0', fontSize: 10 }}>{email}<br />인증 메일이 발송되었습니다.</div>
          </div>
          <button
            className="pixel-btn pixel-btn-primary"
            style={{ width: '100%' }}
            onClick={() => { setMode('login'); setSignupDone(false) }}
          >
            [ OK ]
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <img
          src={appIcon}
          alt="Today Bookmark"
          style={{ width: 64, height: 64, imageRendering: 'pixelated', border: '2px solid var(--border)' }}
        />
        <div style={{ fontWeight: 'bold', fontSize: 13, marginTop: 6 }}>Today Bookmark</div>
        <div style={{ fontSize: 10, color: '#8C80A8', marginTop: 2 }}>북마크 관리 데스크탑</div>
      </div>

      <form onSubmit={submit}>
        <div className="pixel-panel">
          <span className="pixel-panel-title">[ {mode === 'login' ? 'Login' : 'New Account'} ]</span>
          <div className="pixel-row">
            <label className="pixel-label">Email:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="pixel-input"
              placeholder="user@example.com"
            />
          </div>
          <div className="pixel-row">
            <label className="pixel-label">Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="pixel-input"
              placeholder="••••••"
            />
          </div>
          {error && (
            <div className="pixel-msg pixel-msg-error" style={{ marginTop: 6 }}>
              <span>⚠</span><span>{error}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="pixel-btn"
            style={{ fontSize: 10, padding: '3px 8px' }}
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          >
            {mode === 'login' ? '▶ 회원가입' : '◀ 로그인'}
          </button>
          <button type="submit" disabled={loading} className="pixel-btn pixel-btn-primary">
            {loading
              ? <><span className="pixel-blink">▮</span> ...</>
              : mode === 'login' ? '[ Login ]' : '[ Create ]'
            }
          </button>
        </div>
      </form>
    </div>
  )
}
