// eval/versions/appCode.ts 의 복사본이 앱 코드와 여전히 같은지 검사한다.
// 사용: node scripts/00_check_sync.ts
import fs from 'node:fs'
import path from 'node:path'
import { EVAL_ROOT, MODEL, REPO_ROOT } from '../config.ts'

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

const appSrc = fs.readFileSync(path.join(REPO_ROOT, 'apps/extension/src/lib/claude.ts'), 'utf8')
const copySrc = fs.readFileSync(path.join(EVAL_ROOT, 'versions/appCode.ts'), 'utf8')

const m = copySrc.match(/\/\/ <<<APP\r?\n([\s\S]*?)\/\/ APP>>>/)
if (!m) {
  console.error('appCode.ts 에서 // <<<APP ... // APP>>> 블록을 찾지 못했습니다.')
  process.exit(1)
}

// 최상위 선언 단위로 잘라서 (export 접두어만 제거하고) 원본에 그대로 있는지 확인
const block = m[1].replace(/^export /gm, '')
const decls = block.split(/\r?\n(?=(?:const|function|type|\/\/) )/).map(norm).filter(Boolean)
const app = norm(appSrc.replace(/^export /gm, ''))

let failed = 0
for (const d of decls) {
  if (!app.includes(d)) {
    failed++
    console.error(`✗ 앱 코드와 다름: ${d.slice(0, 90)}…`)
  }
}

const problems: string[] = []
if (!appSrc.includes(`model: '${MODEL}'`)) problems.push(`모델 이름이 다름 (config.ts: ${MODEL})`)
if (!/max_tokens:\s*400/.test(appSrc)) problems.push('앱의 max_tokens 가 400 이 아님')
if (!/temperature:\s*0\b/.test(appSrc)) problems.push('앱의 temperature 가 0 이 아님')
for (const p of problems) console.error(`✗ ${p}`)

if (failed || problems.length) {
  console.error('\n앱 코드가 바뀌었습니다. versions/appCode.ts 와 config.ts 를 갱신하세요.')
  process.exit(1)
}
console.log(`✓ 앱 코드와 일치 (선언 ${decls.length}개, 모델 ${MODEL}, max_tokens 400, temperature 0)`)
