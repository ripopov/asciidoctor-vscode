import assert from 'node:assert/strict'
import { after, afterEach, before, describe, mock, test } from 'node:test'
import * as vscode from 'vscode'
import { Logger } from '../core/logger.js'
import { getAsciidocExtensionContributions } from '../features/extensionContributions.js'
import { AsciidocPreview } from '../features/preview/preview.js'
import { AsciidocContentProvider } from '../features/preview/previewContentProvider.js'
import { AsciidocPreviewManager } from '../features/preview/previewManager.js'
import { extensionContext } from './helper.js'
import { createFile, removeFiles } from './workspaceHelper.js'

// Exercise the real preview manager and VS Code panels without depending on
// Asciidoctor rendering speed. Webview modifier handling is tested separately.
type PreviewAccess = Pick<
  AsciidocPreview,
  'state' | 'resource' | 'position' | 'reveal'
> & {
  editor: vscode.WebviewPanel
  onDidClickPreviewLink(href: string, openInNewTab?: boolean): Promise<void>
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 5000
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'timed out waiting for preview')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe('Preview document links', () => {
  let source: vscode.Uri
  let target: vscode.Uri
  let other: vscode.Uri
  let manager: AsciidocPreviewManager | undefined
  let files: vscode.Uri[] = []

  before(async () => {
    source = await createFile('= Source\n', 'preview-links-source.adoc')
    target = await createFile('= Target\n', 'preview links target.adoc')
    other = await createFile('= Other\n', 'preview-links-other.adoc')
    files = [source, target, other]
  })

  afterEach(async () => {
    manager?.dispose()
    manager = undefined
    mock.restoreAll()
    await vscode.workspace
      .getConfiguration('asciidoc', null)
      .update('preview.openLinksToAsciidocFiles', undefined)
  })

  // Removing fixtures only after the suite keeps open panels from attempting
  // to render documents that have already disappeared.
  after(async () => removeFiles(files))

  function setup(locked = false) {
    // Activation already registered the production serializer. Only suppress
    // that duplicate registration; panel creation and tab events stay real.
    mock.method(
      vscode.window,
      'registerWebviewPanelSerializer',
      () => new vscode.Disposable(() => undefined),
    )
    const contentProvider = {
      providePreviewHTML: async (
        document: vscode.TextDocument,
        _config: unknown,
        _preview: unknown,
        _line: unknown,
        fragment: string | undefined,
      ) =>
        `<html><body>${document.uri.toString()}#${fragment || ''}</body></html>`,
    } as unknown as AsciidocContentProvider
    manager = new AsciidocPreviewManager(
      contentProvider,
      new Logger(),
      getAsciidocExtensionContributions(extensionContext),
    )
    manager.preview(source, {
      resourceColumn: vscode.ViewColumn.One,
      previewColumn: vscode.ViewColumn.Two,
      locked,
    })
    const previews = () =>
      (manager as unknown as { _previews: AsciidocPreview[] })._previews
    const access = (preview: AsciidocPreview) =>
      preview as unknown as PreviewAccess
    const original = access(previews()[0])
    return { previews, access, original }
  }

  for (const locked of [false, true]) {
    test(`modified click from a ${locked ? 'locked' : 'dynamic'} preview keeps both tabs in the same group`, async () => {
      const { previews, access, original } = setup(locked)
      await waitFor(() =>
        original.editor.webview.html.includes(source.toString()),
      )
      const originalHtml = original.editor.webview.html
      const originalTitle = original.editor.title
      const originalState = original.state
      const column = original.position
      await original.onDidClickPreviewLink(
        'preview%20links%20target.adoc#first',
        true,
      )
      await waitFor(() => previews().length === 2)
      const linked = access(previews()[1])
      await waitFor(() => linked.editor.webview.html.includes('#first'))
      assert.equal(linked.resource.toString(), target.toString())
      assert.equal(linked.position, column)
      assert.equal(linked.state.locked, true)
      assert.equal(original.editor.title, originalTitle)
      assert.deepEqual(original.state, originalState)
      assert.equal(original.editor.webview.html, originalHtml)

      // Real tab activation events must not deduplicate the two panels.
      original.reveal(column!)
      await waitFor(() => original.editor.active)
      assert.equal(previews().length, 2)
      assert.equal(original.editor.webview.html, originalHtml)

      await original.onDidClickPreviewLink(
        'preview%20links%20target.adoc#second',
        true,
      )
      await waitFor(() => linked.editor.webview.html.includes('#second'))
      assert.equal(
        previews().length,
        2,
        'reuse the linked tab on repeated clicks',
      )
      assert.equal(original.resource.toString(), source.toString())

      // The linked tab stays on its document when a source editor is opened.
      await vscode.window.showTextDocument(other, {
        viewColumn: vscode.ViewColumn.One,
      })
      assert.equal(linked.resource.toString(), target.toString())
    })
  }

  test('ordinary clicks navigate in place, including another anchor in an unchanged document', async () => {
    const { previews, original } = setup(true)
    await waitFor(() =>
      original.editor.webview.html.includes(source.toString()),
    )
    await original.onDidClickPreviewLink('preview%20links%20target.adoc#first')
    await waitFor(() => original.editor.webview.html.includes('#first'))
    assert.equal(previews().length, 1)
    assert.equal(original.resource.toString(), target.toString())
    await original.onDidClickPreviewLink('preview%20links%20target.adoc#second')
    await waitFor(() => original.editor.webview.html.includes('#second'))
    assert.equal(previews().length, 1)
  })

  test('modified clicks open a preview even when ordinary links open the editor', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc', null)
      .update('preview.openLinksToAsciidocFiles', 'inEditor')
    const { previews, access, original } = setup(true)
    await waitFor(() =>
      original.editor.webview.html.includes(source.toString()),
    )
    await original.onDidClickPreviewLink('preview%20links%20target.adoc')
    await waitFor(
      () =>
        vscode.window.activeTextEditor?.document.uri.toString() ===
        target.toString(),
    )
    assert.equal(previews().length, 1)
    assert.equal(original.resource.toString(), source.toString())
    await original.onDidClickPreviewLink(
      'preview%20links%20target.adoc#first',
      true,
    )
    await waitFor(() => previews().length === 2)
    const linked = access(previews()[1])
    await waitFor(() => linked.editor.webview.html.includes('#first'))
    assert.equal(linked.resource.toString(), target.toString())
  })

  test('extensionless and absolute file links open the resolved preview', async () => {
    const { previews, access, original } = setup(true)
    await original.onDidClickPreviewLink('preview%20links%20target#first', true)
    await waitFor(() => previews().length === 2)
    const linked = access(previews()[1])
    await waitFor(() => linked.editor.webview.html.includes('#first'))
    await original.onDidClickPreviewLink(`${target.toString()}#second`, true)
    await waitFor(() => linked.editor.webview.html.includes('#second'))
    assert.equal(previews().length, 2)
  })
})
