import fs from 'node:fs'

// RFC 4180 스타일 CSV. 엑셀에서 한글이 깨지지 않도록 BOM 을 붙여 쓰고, 읽을 때는 제거한다.

export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''))
  if (!nonEmpty.length) return []
  const header = nonEmpty[0].map((h) => h.trim())
  return nonEmpty.slice(1).map((r) => {
    const o: Record<string, string> = {}
    header.forEach((h, i) => { o[h] = (r[i] ?? '').trim() })
    return o
  })
}

function esc(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const lines = [columns.join(',')]
  for (const r of rows) lines.push(columns.map((c) => esc(r[c])).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export function readCsv(file: string): Record<string, string>[] {
  return parseCsv(fs.readFileSync(file, 'utf8'))
}

export function writeCsv(file: string, rows: Record<string, unknown>[], columns: string[]): void {
  fs.writeFileSync(file, toCsv(rows, columns), 'utf8')
}
