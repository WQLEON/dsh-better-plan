#!/usr/bin/env node
/**
 * Validate the portable skill package: frontmatter, referenced files, and the
 * third-party notice it promises. Run from the repository root.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const skillDir = path.join(root, 'better-plan-skill')
const failures = []

function fail(message) {
  failures.push(message)
}
function read(file) {
  try {
    return fs.readFileSync(path.join(skillDir, file), 'utf8')
  } catch {
    fail(`missing ${file}`)
    return ''
  }
}

const skill = read('SKILL.md')

// 1. Frontmatter with a name and a description.
const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(skill)
if (!frontmatter) {
  fail('SKILL.md has no YAML frontmatter')
} else {
  const block = frontmatter[1]
  if (!/^name:\s*better-plan\s*$/m.test(block)) fail('frontmatter name must be "better-plan"')
  if (!/^description:\s*\S+/m.test(block)) fail('frontmatter needs a description')
}

// 2. Every local file the skill points at exists.
for (const file of ['references/grilling.md', 'references/domain-modeling.md', 'README.md']) {
  if (!fs.existsSync(path.join(skillDir, file))) fail(`missing better-plan-skill/${file}`)
}

// 3. The adapted upstream text keeps its notice, and the root notice exists.
for (const file of ['references/grilling.md', 'references/domain-modeling.md']) {
  const body = read(file)
  if (!/mattpocock\/skills/.test(body) || !/THIRD_PARTY_NOTICES\.md/.test(body)) {
    fail(`${file} must credit mattpocock/skills and point at THIRD_PARTY_NOTICES.md`)
  }
}
if (!/grill-with-docs/.test(skill)) fail('SKILL.md must name the upstream grill-with-docs lineage')
if (!fs.existsSync(path.join(root, 'THIRD_PARTY_NOTICES.md'))) fail('missing THIRD_PARTY_NOTICES.md')

if (failures.length > 0) {
  console.error('better-plan-skill validation failed:')
  for (const message of failures) console.error(' -', message)
  process.exit(1)
}
console.log('better-plan-skill: frontmatter, references and notices OK')
