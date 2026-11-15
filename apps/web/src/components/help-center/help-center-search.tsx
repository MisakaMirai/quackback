import { useEffect, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { contentPreview } from '@/lib/shared/utils/string'
import { useKbSearch, type KbSearchArticle } from '@/components/help-center/use-kb-search'
import { DEFAULT_LOCALE } from '@/lib/shared/i18n'
import { hcArticlePath } from '@/lib/shared/help-center-url'

// ============================================================================
// Hero Search (landing page)
// ============================================================================

interface HelpCenterHeroSearchProps {
  /** Content locale (domains/languages §2). Omitted = default locale. */
  locale?: string
}

export function HelpCenterHeroSearch({ locale }: HelpCenterHeroSearchProps) {
  const intl = useIntl()
  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { results, isSearching } = useKbSearch({
    query,
    limit: 8,
    locale,
    onResults: (articles) => setShowResults(articles.length > 0),
  })

  useEffect(() => {
    if (!query.trim()) setShowResults(false)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleResultClick = (result: KbSearchArticle) => {
    setShowResults(false)
    setQuery('')
    window.location.href = hcArticlePath({
      locale: locale ?? DEFAULT_LOCALE,
      urlId: result.urlId,
      slug: result.slug,
    })
  }

  const placeholderText = intl.formatMessage({
    id: 'portal.hc.search.placeholder',
    defaultMessage: 'Search articles...',
  })

  return (
    <div ref={containerRef} role="search" className="relative w-full">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted pl-5 pr-2 shadow-lg transition-[color,box-shadow] focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/20">
        <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <input
          id="hc-search"
          type="search"
          aria-label={placeholderText}
          placeholder={placeholderText}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setShowResults(true)
          }}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-4 text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        {isSearching && (
          <div className="shrink-0 pr-1">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-border bg-popover shadow-lg z-50 overflow-hidden">
          <ul className="py-1">
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => handleResultClick(result)}
                  className="w-full text-left px-4 py-3 transition-colors hover:bg-accent"
                >
                  <div className="text-sm font-medium text-foreground">{result.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{result.category.name}</div>
                  {result.content && (
                    <div className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
                      {contentPreview(result.content, 150)}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Compact Search (header button placeholder)
// ============================================================================

export function HelpCenterCompactSearch() {
  return (
    <Button variant="outline" size="sm" className="gap-2 text-muted-foreground" disabled>
      <MagnifyingGlassIcon className="h-4 w-4" />
      <span className="hidden sm:inline">Search...</span>
    </Button>
  )
}
