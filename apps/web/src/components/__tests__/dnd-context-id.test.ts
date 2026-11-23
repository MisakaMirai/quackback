// @vitest-environment node
/**
 * dnd-kit derives each draggable's `aria-describedby` from the nearest
 * DndContext's id, and only falls back to a process-wide counter
 * (`DndDescribedBy-0`, `-1`, …) when the context has none. That counter
 * advances with every render in the process that produced the markup, so the
 * server and the hydration pass disagree about it and React drops the
 * attribute instead of patching it. Every DndContext therefore carries a
 * client-stable id — React's `useId()` gives the same value on both sides.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..')

function tsxFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) tsxFiles(full, found)
    else if (entry.name.endsWith('.tsx')) found.push(full)
  }
  return found
}

/**
 * The opening tag that starts at `index`, balancing braces and strings so a
 * `=>` or a `>` inside a prop value does not end it early.
 */
function openingTag(source: string, index: number): string {
  let depth = 0
  let quote = ''
  for (let i = index + '<DndContext'.length; i < source.length; i += 1) {
    const char = source[i]
    if (quote) {
      if (char === '\\') i += 1
      else if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'" || char === '`') quote = char
    else if (char === '{') depth += 1
    else if (char === '}') depth -= 1
    else if (char === '>' && depth === 0) return source.slice(index, i + 1)
  }
  return source.slice(index)
}

describe('DndContext ids', () => {
  it('gives every drop target context a stable id', () => {
    const offenders: string[] = []
    for (const file of tsxFiles(SRC)) {
      if (file.includes(`${sep}__tests__${sep}`)) continue
      const source = readFileSync(file, 'utf8')
      for (
        let at = source.indexOf('<DndContext');
        at !== -1;
        at = source.indexOf('<DndContext', at + 1)
      ) {
        if (!/\bid\s*=/.test(openingTag(source, at))) {
          offenders.push(relative(SRC, file))
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
