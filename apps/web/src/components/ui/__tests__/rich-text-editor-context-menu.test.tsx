// @vitest-environment happy-dom
/**
 * Every right-click and long-press belongs to the browser, on text and on
 * images alike: on a phone that menu is the only way to copy, and it carries
 * the image actions the platform offers. The editor must not cancel
 * `contextmenu` anywhere in its subtree, and it must not open a menu of its own.
 *
 * Image actions stay reachable from the selection toolbar (see ImageToolbar),
 * which also covers deleting an inline image.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { RichTextEditor } from '../rich-text-editor'

afterEach(cleanup)

const upload = async () => 'https://example.com/a.png'

/** A paragraph with an inline image node, which the node view renders as <img>. */
const docWithImage = {
  type: 'doc' as const,
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'image', attrs: { src: 'https://example.com/a.png', alt: 'a' } },
      ],
    },
  ],
}

async function mountedEditor(container: HTMLElement) {
  return waitFor(() => {
    const element = container.querySelector<HTMLElement & { editor: Editor }>('.ProseMirror')
    expect(element).not.toBeNull()
    return element!
  })
}

async function mountedImage(container: HTMLElement) {
  return waitFor(() => {
    const element = container.querySelector<HTMLImageElement>('.image-component img')
    expect(element).not.toBeNull()
    return element!
  })
}

/** A contextmenu as the browser dispatches it; returns whether it was cancelled. */
function rightClick(target: Element) {
  let prevented = false
  act(() => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    target.dispatchEvent(event)
    prevented = event.defaultPrevented
  })
  return prevented
}

describe('RichTextEditor context menu', () => {
  it('leaves the native menu alone on text', async () => {
    const { container } = render(
      <RichTextEditor
        value={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
        }}
      />
    )
    const dom = await mountedEditor(container)
    const paragraph = dom.querySelector('p')!
    expect(paragraph).not.toBeNull()

    // Copy / Paste / spellcheck are the browser's to offer.
    expect(rightClick(paragraph)).toBe(false)
  })

  it('leaves the native menu alone on an image', async () => {
    const { container } = render(
      <RichTextEditor value={docWithImage} features={{ images: true }} onImageUpload={upload} />
    )
    await mountedEditor(container)
    const image = await mountedImage(container)

    // Open image in new tab / Save / Copy image / Copy image address.
    expect(rightClick(image)).toBe(false)
  })

  it('opens no editor menu of its own on right-click', async () => {
    const { container } = render(
      <RichTextEditor value={docWithImage} features={{ images: true }} onImageUpload={upload} />
    )
    await mountedEditor(container)
    const image = await mountedImage(container)

    fireEvent.pointerDown(image)
    expect(rightClick(image)).toBe(false)
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  it('keeps the image actions on the selection toolbar', async () => {
    const { container } = render(
      <RichTextEditor value={docWithImage} features={{ images: true }} onImageUpload={upload} />
    )
    const dom = await mountedEditor(container)
    const image = await mountedImage(container)
    const editor = dom.editor

    act(() => {
      editor.commands.setNodeSelection(editor.view.posAtDOM(image, 0))
    })

    await waitFor(() => {
      expect(document.querySelector('[aria-label="Image options"]')).not.toBeNull()
    })
  })

  it('deletes the image from that toolbar', async () => {
    const { container } = render(
      <RichTextEditor value={docWithImage} features={{ images: true }} onImageUpload={upload} />
    )
    const dom = await mountedEditor(container)
    const image = await mountedImage(container)
    const editor = dom.editor

    act(() => {
      editor.commands.setNodeSelection(editor.view.posAtDOM(image, 0))
    })

    const deleteButton = await waitFor(() => {
      const element = document.querySelector<HTMLButtonElement>('[aria-label="Delete image"]')
      expect(element).not.toBeNull()
      return element!
    })
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(container.querySelector('.image-component img')).toBeNull()
    })
  })
})
