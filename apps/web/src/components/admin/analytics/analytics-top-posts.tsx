import { Link } from '@tanstack/react-router'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { AnalyticsBarList } from './analytics-bar-list'
import { AnalyticsEmpty } from './analytics-empty'

interface TopPostsProps {
  posts: Array<{
    rank: number
    postId: string
    title: string
    voteCount: number
    commentCount: number
    boardName: string | null
    statusName: string | null
  }>
}

export function AnalyticsTopPosts({ posts }: TopPostsProps) {
  const intl = useOptionalIntl()
  if (posts.length === 0) {
    return (
      <AnalyticsEmpty
        message={intl.formatMessage({
          id: 'admin.analytics.empty.topPosts',
          defaultMessage: 'No posts in this period',
        })}
      />
    )
  }

  return (
    <AnalyticsBarList
      header={{
        label: intl.formatMessage({
          id: 'admin.analytics.column.post',
          defaultMessage: 'Post',
        }),
        value: intl.formatMessage({ id: 'common.userStats.votes', defaultMessage: 'Votes' }),
      }}
      rows={posts.map((post) => ({
        key: post.postId,
        value: post.voteCount,
        label: (
          <Link
            to="/admin/feedback"
            search={{ post: post.postId }}
            className="transition-colors hover:text-primary"
          >
            {post.title}
          </Link>
        ),
      }))}
    />
  )
}
