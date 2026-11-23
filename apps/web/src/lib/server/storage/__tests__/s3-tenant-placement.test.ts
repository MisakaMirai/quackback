/**
 * Storage placement under a workspace scope.
 *
 * Persist stores host-independent `/api/storage/<key>` refs. Off-host leaves
 * absolutize from the pinned system-host publicUrl, never from the friendly
 * platform URL or the process-wide `S3_PUBLIC_URL` / `BASE_URL`.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/server/config', () => ({
  config: {
    s3Bucket: 'env-bucket',
    s3Region: 'env-region',
    s3Endpoint: 'https://env-endpoint.example.net',
    s3AccessKeyId: 'env-access-key',
    s3SecretAccessKey: 'env-secret-key',
    s3ForcePathStyle: true,
    s3PublicUrl: 'https://env-cdn.example.net',
    s3Proxy: false,
    baseUrl: 'https://env-app.example.net',
  },
}))

/**
 * Placement and credentials are no longer readable as values: `getS3Config` and
 * `getStoragePlacement` are module-private, because a bucket plus a credential
 * is a complete capability to address any object and nothing outside the module
 * needs one. So the tests that used to read them now observe them where they are
 * spent — the `Bucket` a command names, and the credentials a client is built
 * with. That is a better question than the old one: it asks what the request
 * actually addressed rather than what an accessor was willing to say.
 */
const sent: Array<{ Bucket: string; Key: string }> = []
const clientConfigs: Array<{
  region: string
  endpoint?: string
  forcePathStyle: boolean
  credentials: { accessKeyId: string; secretAccessKey: string }
}> = []

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function (cfg: (typeof clientConfigs)[number]) {
    clientConfigs.push(cfg)
    return {
      send: async (command: { input: { Bucket: string; Key: string } }) => {
        sent.push(command.input)
        return {}
      },
      destroy: vi.fn(),
    }
  }),
  PutObjectCommand: vi.fn(function (input: unknown) {
    return { input }
  }),
  GetObjectCommand: vi.fn(function (input: unknown) {
    return { input }
  }),
  DeleteObjectCommand: vi.fn(function (input: unknown) {
    return { input }
  }),
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async () => 'https://stub'),
}))

const { getPublicUrlOrNull, getStorageSigningSecret, isS3Usable, resignStoredAssetUrl } =
  await import('../s3')
const { withWorkspace } = await import('@/lib/server/__tests__/workspace-scope')

beforeEach(() => {
  sent.length = 0
  clientConfigs.length = 0
})

// `logos/` is a public prefix; `attachments/` is not (unknown prefixes are private).
const PUBLIC_KEY = 'logos/2026/08/brand.png'
const PRIVATE_KEY = 'attachments/2026/08/contract.pdf'

/**
 * The pessimistic case: every workspace holding the SAME storage secret. The read
 * token must still be workspace-bound, because the object key alone does not say
 * which bucket it names.
 *
 * Passed per call rather than installed globally — the credentials now live on
 * the workspace scope, resolved at pool checkout, so "shared" is a property of the
 * fixture rather than of a process-wide switch.
 */
const SHARED_SECRET = {
  storage: { accessKeyId: 'shared-key', secretAccessKey: 'shared-secret' },
} as const

describe('public URLs', () => {
  it('persists a host-independent /api/storage ref, not the environment CDN', () => {
    const url = withWorkspace('workspace-alpha', () => getPublicUrlOrNull(PUBLIC_KEY))

    expect(url).toBe(`/api/storage/${PUBLIC_KEY}`)
    expect(url).not.toContain('env-cdn.example.net')
    expect(url).not.toContain('assets-workspace-alpha')
  })

  it('keeps persist relative after a friendly URL rename', () => {
    const url = withWorkspace('workspace-alpha', () => getPublicUrlOrNull(PUBLIC_KEY), {
      storage: { publicUrl: 'https://ws-abc123.quackback.co.uk/api/storage' },
      baseUrl: 'https://acme.quackback.co.uk',
    })

    expect(url).toBe(`/api/storage/${PUBLIC_KEY}`)
    expect(url).not.toContain('acme.quackback.co.uk')
    expect(url).not.toContain('env-cdn.example.net')
  })

  it('gives two workspaces the same persist form for the same key', () => {
    const alpha = withWorkspace('workspace-alpha', () => getPublicUrlOrNull(PUBLIC_KEY))
    const bravo = withWorkspace('workspace-bravo', () => getPublicUrlOrNull(PUBLIC_KEY))

    expect(alpha).toBe(`/api/storage/${PUBLIC_KEY}`)
    expect(bravo).toBe(`/api/storage/${PUBLIC_KEY}`)
  })

  it('does not fall back to the environment BASE_URL for persist', () => {
    const url = withWorkspace('workspace-alpha', () => getPublicUrlOrNull(PUBLIC_KEY), {
      storage: { publicUrl: '' },
    })

    expect(url).toBe(`/api/storage/${PUBLIC_KEY}`)
    expect(url).not.toContain('env-app.example.net')
  })

  it('still persists a relative ref with no workspace scope', () => {
    expect(getPublicUrlOrNull(PUBLIC_KEY)).toBe(`/api/storage/${PUBLIC_KEY}`)
  })

  it('routes private keys through /api/storage with a read capability', () => {
    const url = withWorkspace('workspace-alpha', () => getPublicUrlOrNull(PRIVATE_KEY), {
      secrets: SHARED_SECRET,
    })

    expect(url).toBe(
      `/api/storage/${PRIVATE_KEY}?read=${new URL(url!, 'https://placeholder.invalid').searchParams.get('read')}`
    )
    expect(url).toContain(`/api/storage/${PRIVATE_KEY}?read=`)
    expect(url).not.toContain('workspace-alpha.example.com')
  })

  it('resigns an unsigned legacy private URL with the current workspace token', () => {
    const minted = withWorkspace('workspace-alpha', () => getPublicUrlOrNull(PRIVATE_KEY), {
      secrets: SHARED_SECRET,
    })
    const resigned = withWorkspace(
      'workspace-alpha',
      () => resignStoredAssetUrl(`https://old.example.com/api/storage/${PRIVATE_KEY}`),
      { secrets: SHARED_SECRET }
    )
    expect(resigned).toBe(minted)
    expect(resigned).toContain(`?read=`)
  })

  it('replaces a stale private token rather than keeping it', () => {
    const resigned = withWorkspace(
      'workspace-alpha',
      () =>
        resignStoredAssetUrl(`/api/storage/${PRIVATE_KEY}?read=deadbeefdeadbeefdeadbeefdeadbeef`),
      { secrets: SHARED_SECRET }
    )
    expect(resigned).not.toContain('deadbeef')
    expect(resigned).toBe(
      withWorkspace('workspace-alpha', () => getPublicUrlOrNull(PRIVATE_KEY), {
        secrets: SHARED_SECRET,
      })
    )
  })

  it('leaves a foreign src untouched', () => {
    expect(resignStoredAssetUrl('https://cdn.example.com/brand.png')).toBe(
      'https://cdn.example.com/brand.png'
    )
  })

  it('keeps an unsigned portal-images src unsigned', () => {
    const src = '/api/storage/portal-images/2026/04/4eea0db0-screenshot.png'
    expect(resignStoredAssetUrl(src)).toBe(src)
    expect(resignStoredAssetUrl(`https://old.example.com${src}`)).toBe(src)
  })

  it('leaves the unscoped read signature byte-identical to the historical one', () => {
    // HMAC-SHA256('env-secret-key', 'read|<key>') truncated to 32 hex chars —
    // the message as it stood before workspaces. These signatures are embedded in
    // stored refs already written into content, so a changed message is a fleet
    // of dead asset links, not a migration.
    const url = getPublicUrlOrNull(PRIVATE_KEY)

    expect(new URL(url!, 'https://placeholder.invalid').searchParams.get('read')).toBe(
      'e5d708d10b754b004667a83a235584f6'
    )
  })
})

describe('placement', () => {
  it('reads the bucket and credentials from the environment', () => {
    expect(withWorkspace('workspace-alpha', () => isS3Usable())).toBe(true)
    expect(getStorageSigningSecret()).toBe('env-secret-key')
  })
})
