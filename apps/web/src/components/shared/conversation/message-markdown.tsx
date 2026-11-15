import { useId } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Element, Root } from 'hast'
import { cn } from '@/lib/shared/utils'
import { sanitizeImageUrl, sanitizeUrl } from '@/lib/shared/utils/sanitize'

/** Scope footnote labels per message: remark-rehype gives every document the
 *  same footnote heading ID, so two messages in one thread would otherwise
 *  collide on it (and on the backlink aria-describedby). */
function scopeFootnotes(footnotePrefix: string) {
  return (tree: Root) => {
    function walk(parent: Root | Element) {
      if (parent.type === 'element') {
        const properties = parent.properties
        if (properties.id === 'footnote-label') properties.id = `${footnotePrefix}footnote-label`
        if (Array.isArray(properties.ariaDescribedBy))
          properties.ariaDescribedBy = properties.ariaDescribedBy.map((id) =>
            id === 'footnote-label' ? `${footnotePrefix}footnote-label` : id
          )
      }
      for (const child of parent.children) {
        if (child.type === 'element') walk(child)
      }
    }
    walk(tree)
  }
}

// Keep component identities stable across text updates, preserving DOM nodes,
// selections and focus while a message re-renders.
const components: Components = {
  a: ({ node: _node, href, children, className, ...props }) =>
    href ? (
      <a
        {...props}
        href={href}
        target={href.startsWith('#') ? undefined : '_blank'}
        rel="noopener noreferrer"
        className={cn('underline underline-offset-2', className)}
      >
        {children}
      </a>
    ) : (
      <>{children}</>
    ),
  img: ({ src, alt, title }) =>
    typeof src === 'string' && src ? (
      <img
        src={src}
        alt={alt ?? ''}
        title={title}
        loading="lazy"
        className="max-w-full rounded-lg"
      />
    ) : (
      <>{alt}</>
    ),
  p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
  table: ({ children }) => (
    <div className="max-w-full overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
}

/** Shared by admin and visitor messages. Render Markdown as React elements;
 * raw HTML stays escaped and URL protocols are checked before creating links or
 * images. Keep canonical TipTap documents on the rich-text render path. */
export function MessageMarkdown({ text, className }: { text: string; className?: string }) {
  const footnotePrefix = `message-${useId()}-`
  return (
    <div
      className={cn(
        'min-w-0 max-w-full space-y-2 text-sm leading-relaxed [overflow-wrap:anywhere]',
        '[&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold',
        '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:ps-5 [&_ol]:ps-5 [&_li]:my-1',
        '[&_blockquote]:border-s-2 [&_blockquote]:border-current [&_blockquote]:ps-3',
        '[&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-foreground/5 [&_pre]:p-3',
        '[&_code]:rounded [&_code]:bg-foreground/5 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em] [&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:text-start [&_td]:border [&_td]:border-border [&_td]:p-2',
        '[&_.contains-task-list]:list-none',
        className
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        remarkRehypeOptions={{ clobberPrefix: footnotePrefix }}
        rehypePlugins={[[scopeFootnotes, footnotePrefix]]}
        components={components}
        urlTransform={(url, key) => (key === 'src' ? sanitizeImageUrl(url) : sanitizeUrl(url))}
      >
        {text}
      </Markdown>
    </div>
  )
}
