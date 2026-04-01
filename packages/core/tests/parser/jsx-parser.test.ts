import { describe, expect, it } from 'vitest'

import { parseJsxCode } from '../../src/parser/jsx-parser.js'

describe('parseJsxCode', () => {
  it('should extract classes from string className', () => {
    const result = parseJsxCode(
      '/virtual/App.tsx',
      `export function App(){ return <div className="foo bar" /> }`,
    )

    expect(result.used.has('foo')).toBe(true)
    expect(result.used.has('bar')).toBe(true)
  })

  it('should extract static and conditional classes from template literals', () => {
    const result = parseJsxCode(
      '/virtual/App.tsx',
      `export function App(){ return <div className={\`btn \${active ? 'active' : ''}\`} /> }`,
    )

    expect(result.used.has('btn')).toBe(true)
    expect(result.used.has('active')).toBe(true)
  })

  it('should extract classes from clsx calls', () => {
    const result = parseJsxCode(
      '/virtual/App.tsx',
      [
        `import clsx from 'clsx'`,
        `export function App(){`,
        `  return <div className={clsx('btn', { active: isActive }, cond && 'extra')} />`,
        `}`,
      ].join('\n'),
    )

    expect(result.used.has('btn')).toBe(true)
    expect(result.used.has('active')).toBe(true)
    expect(result.used.has('extra')).toBe(true)
  })

  it('should skip css modules member expression', () => {
    const result = parseJsxCode(
      '/virtual/App.tsx',
      `export function App(){ return <div className={styles.btn} /> }`,
    )

    expect(result.used.size).toBe(0)
    expect(result.uncertain.size).toBe(0)
  })

  it('should classify variable and call expressions as uncertain', () => {
    const result = parseJsxCode(
      '/virtual/App.tsx',
      [
        `export function App(){`,
        `  return (`,
        `    <>`,
        `      <div className={dynamicClass} />`,
        `      <div className={getClass()} />`,
        `    </>`,
        `  )`,
        `}`,
      ].join('\n'),
    )

    expect(result.uncertain.has('dynamicClass')).toBe(true)
    expect([...result.uncertain].some((item) => item.includes('getClass'))).toBe(true)
  })
})
