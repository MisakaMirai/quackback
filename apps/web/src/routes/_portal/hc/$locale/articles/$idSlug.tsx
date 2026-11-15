import { createFileRoute, Outlet } from '@tanstack/react-router'
import { HelpCenterHero } from '@/components/help-center/help-center-hero'
import { HelpCenterHeroSearch } from '@/components/help-center/help-center-search'

export const Route = createFileRoute('/_portal/hc/$locale/articles/$idSlug')({
  component: ArticleLayout,
})

function ArticleLayout() {
  const { locale } = Route.useParams()
  return (
    <>
      <HelpCenterHero variant="compact">
        <HelpCenterHeroSearch locale={locale} />
      </HelpCenterHero>
      <div className="mx-auto max-w-7xl">
        <Outlet />
      </div>
    </>
  )
}
