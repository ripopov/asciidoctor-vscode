import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

interface LinkMessage {
  type: string
  body: { href?: string; openInNewTab?: boolean; line?: number }
}

function webview() {
  const noop = () => undefined
  const messages: LinkMessage[] = []
  let onClick: (event: unknown) => void
  const dependencies: Record<string, unknown> = {
    './activeLineMarker.js': { ActiveLineMarker: class {} },
    './content-update.js': {},
    './events.js': { onceDocumentLoaded: noop },
    './messaging.js': {
      createPosterForVsCode: () => ({
        postMessage: (type: string, body: LinkMessage['body']) =>
          messages.push({ type, body }),
      }),
    },
    './scroll-sync.js': {
      getSourceLineForElement: () => 12,
      suppressScrollEcho: noop,
    },
    './settings.js': {
      getSettings: () => ({
        source: 'file:///docs/source.adoc',
        scrollEditorWithPreview: true,
      }),
      getData: () => ({}),
    },
    'lodash.throttle': (fn: unknown) => fn,
  }
  // Execute the actual webview entry point, including its registered click
  // listener, rather than duplicating its link-routing logic in the test.
  const source = readFileSync(
    new URL('../../../../preview-src/index.ts', import.meta.url),
    'utf8',
  )
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
    reportDiagnostics: true,
  })
  assert.equal(compiled.diagnostics?.length, 0)
  runInNewContext(compiled.outputText, {
    exports: {},
    require: (name: string) => {
      assert.ok(name in dependencies, `unexpected dependency: ${name}`)
      return dependencies[name]
    },
    acquireVsCodeApi: () => ({ getState: () => ({}), setState: noop }),
    window: {
      cspAlerter: { setPoster: noop },
      styleLoadingMonitor: { setPoster: noop },
      addEventListener: noop,
    },
    document: {
      getElementById: () => ({}),
      addEventListener: (type: string, listener: typeof onClick) => {
        if (type === 'click') {
          onClick = listener
        }
      },
    },
  })
  const click = (href: string, modifiers = {}, dataHref?: string) => {
    const link = {
      tagName: 'A',
      href: href.startsWith('#') ? `file:///docs/source.adoc${href}` : href,
      getAttribute: (name: string) => (name === 'data-href' ? dataHref : href),
    }
    const event = {
      target: { parentNode: link },
      ctrlKey: false,
      metaKey: false,
      prevented: false,
      stopped: false,
      preventDefault() {
        this.prevented = true
      },
      stopPropagation() {
        this.stopped = true
      },
      ...modifiers,
    }
    onClick(event)
    return event
  }
  return { messages, click }
}

describe('Preview link modifiers', () => {
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, {}]) {
    test(`local links pass through modifiers ${JSON.stringify(modifiers)} from nested elements`, () => {
      const { messages, click } = webview()
      const event = click('guide.adoc#section', modifiers)
      assert.equal(event.prevented, true)
      assert.equal(event.stopped, true)
      assert.equal(messages[0].type, 'clickLink')
      assert.equal(messages[0].body.href, 'guide.adoc#section')
      assert.equal(
        messages[0].body.openInNewTab,
        !!(modifiers.ctrlKey || modifiers.metaKey),
      )
    })
  }

  test('Antora data-href retains the resolved local target and modifier', () => {
    const { messages, click } = webview()
    click(
      'https://example.com/page.html',
      { ctrlKey: true },
      '/docs/guide.adoc#section',
    )
    assert.equal(messages[0].body.href, '/docs/guide.adoc#section')
    assert.equal(messages[0].body.openInNewTab, true)
  })

  test('external links keep their browser behavior', () => {
    for (const href of [
      'https://example.com',
      'mailto:someone@example.com',
      'vscode://settings',
    ]) {
      const { messages, click } = webview()
      assert.equal(click(href, { ctrlKey: true }).prevented, false)
      assert.equal(messages.length, 0)
    }
  })

  test('in-page anchors still navigate in place and reveal the source', () => {
    const { messages, click } = webview()
    assert.equal(click('#section', { ctrlKey: true }).prevented, false)
    assert.equal(messages[0].type, 'revealLine')
    assert.equal(messages[0].body.line, 11)
  })
})
