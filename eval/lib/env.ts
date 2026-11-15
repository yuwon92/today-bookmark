import fs from 'node:fs'
import path from 'node:path'
import { EVAL_ROOT, REPO_ROOT } from '../config.ts'

function parseEnvFile(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (v) out[m[1]] = v
  }
  return out
}

const evalEnv = parseEnvFile(path.join(EVAL_ROOT, '.env'))
const extEnv = parseEnvFile(path.join(REPO_ROOT, 'apps', 'extension', '.env'))

function pick(...candidates: Array<string | undefined>): string {
  for (const c of candidates) if (c) return c
  return ''
}

export const env = {
  supabaseUrl: pick(process.env.SUPABASE_URL, evalEnv.SUPABASE_URL, extEnv.VITE_SUPABASE_URL).replace(/\/$/, ''),
  supabaseServiceKey: pick(process.env.SUPABASE_SERVICE_ROLE_KEY, evalEnv.SUPABASE_SERVICE_ROLE_KEY),
  anthropicKey: pick(process.env.ANTHROPIC_API_KEY, evalEnv.ANTHROPIC_API_KEY, extEnv.VITE_CLAUDE_API_KEY),
  jinaKey: pick(process.env.JINA_API_KEY, evalEnv.JINA_API_KEY, extEnv.VITE_JINA_API_KEY),
  userId: pick(process.env.EVAL_USER_ID, evalEnv.EVAL_USER_ID),
}

export function requireEnv(name: keyof typeof env, hint: string): string {
  const v = env[name]
  if (!v) {
    console.error(`[env] ${name} 값이 없습니다. ${hint}`)
    process.exit(1)
  }
  return v
}
