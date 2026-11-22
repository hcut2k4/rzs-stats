import { expect, it } from 'vitest'

const fixtures = import.meta.glob('./fixtures/playoffs/*.json')
const tests = import.meta.glob('./**/*.test.{js,jsx}', { query: '?raw', import: 'default', eager: true })

it('uses every backend playoff fixture in at least one test file', () => {
  const used = new Set()
  for (const [file, source] of Object.entries(tests)) {
    if (file === './playoffFixtures.test.js') continue
    for (const match of source.matchAll(/import (\w+) from ['"](.\/fixtures\/playoffs\/[^'"]+\.json)['"]/g)) {
      if (new RegExp(`\\b${match[1]}\\b`).test(source.replace(match[0], ''))) used.add(match[2])
    }
  }
  for (const fixture of Object.keys(fixtures)) {
    expect(used.has(fixture), `${fixture} needs a test importing and using its response`).toBe(true)
  }
})
