/**
 * Composing a bucket object name for this install, then proving it landed
 * inside the install's namespace.
 *
 * ## Why an install needs a prefix at all
 *
 * One bucket may hold more than objects written by this app: an operator can
 * point several installs at one bucket, and a bucket may carry objects from
 * before the namespace existed. The prefix keeps this install's objects
 * together and lets the relocation below recognise the ones that predate it.
 * It moves the isolation boundary out of the provider and into this file — a
 * per-bucket credential cannot name another bucket whatever the application
 * believes, but a shared bucket has no such backstop.
 *
 * ## Why the WorkspaceId, and not some other identifier
 *
 * The namespace is `settings.id` — the branded {@link WorkspaceId}. It is not a
 * new identifier and refusing to invent one is the point: `settings` is a
 * singleton row, so its primary key is a process-lifetime constant that cannot
 * drift. A slug, a hostname, a request parameter or a segment of a stored key
 * would all change under the operator's feet and silently forfeit the
 * inheritance.
 *
 * ## The stored key never carries the namespace
 *
 * `generateStorageKey()` keeps producing `uploads/2026/08/…`, the database keeps
 * storing exactly that, and `w/<workspaceId>/` is added here and stripped
 * nowhere else. Two properties depend on it. `isPublicStorageKey` still
 * classifies on segment 0 of the *stored* key, so prefixing does not turn every
 * public asset private. And `contentJson` stores host-independent
 * `/api/storage/${key}` refs, which stay valid across a friendly URL rename
 * and make any future move of the objects a copy rather than a content rewrite.
 *
 * ## Compose, then verify
 *
 * {@link composeNamespacedKey} is the only door, and it asserts on the *result*
 * rather than on the input. Verifying the composed name is what makes one check
 * cover traversal, absolute keys, empty keys and encoding tricks at once: they
 * are all the same claim — "the name that is about to reach a command is not
 * inside the namespace it was composed for" — and asking that question of the
 * finished string cannot miss a way of arriving at it. A composed name that
 * fails throws. It never falls back to the un-namespaced key.
 */
import { fromUuid, isTypeId, type WorkspaceId } from '@quackback/ids'
import { db } from '@/lib/server/db'

/**
 * Segment 0 of every object name this application writes.
 *
 * A literal marker rather than the bare workspace id so that an object's owner
 * is legible to a human reading a bucket listing during an incident, and so that
 * anything already at the bucket root is unambiguously *not* ours — see the
 * relocation note in `s3.ts`.
 */
export const WORKSPACE_NAMESPACE_ROOT = 'w'

/** S3 and every compatible provider cap an object key at 1024 UTF-8 bytes. */
const MAX_OBJECT_NAME_BYTES = 1024

/**
 * Any C0 control character, or DEL.
 *
 * A codepoint scan rather than a regex on purpose. `no-control-regex` is right
 * to ban these in a pattern — a control character in a regex is nearly always a
 * paste accident — and writing it as a comparison also keeps the bytes out of
 * the source, where a raw NUL compiles fine, is invisible in a diff, and is
 * silently skipped by this environment's grep.
 */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * A composed object name did not land inside its workspace namespace.
 *
 * Deliberately not a subclass of anything the storage surfaces already catch:
 * `StorageUnavailableError` becomes a 503 an operator is meant to fix, and this
 * is not that. This is a caller handing the storage boundary a key that would
 * have addressed something it must not, and it should surface as a fault.
 */
export class StorageNamespaceViolation extends Error {
  readonly workspaceId: WorkspaceId
  readonly key: string
  constructor(workspaceId: WorkspaceId, key: string, reason: string) {
    super(`Storage key ${JSON.stringify(key)} is not addressable in ${workspaceId}: ${reason}`)
    this.name = 'StorageNamespaceViolation'
    this.workspaceId = workspaceId
    this.key = key
  }
}

/** Everything every object name for `workspaceId` begins with. */
export function workspaceNamespace(workspaceId: WorkspaceId): string {
  return `${WORKSPACE_NAMESPACE_ROOT}/${workspaceId}/`
}

/** The storage namespace cannot be resolved. */
export class WorkspaceNamespaceUnresolvable extends Error {
  constructor(detail: string) {
    super(
      `Cannot resolve the storage namespace: ${detail}. Every object name is composed ` +
        `from settings.id, so storage has nothing to address until that is known.`
    )
    this.name = 'WorkspaceNamespaceUnresolvable'
  }
}

let resolvedWorkspaceId: WorkspaceId | null = null

/**
 * The install's `settings.id`, memoised.
 *
 * `settings` is a singleton row and its primary key never changes, so this is a
 * process-lifetime constant rather than a cache with a staleness question. The
 * memo only saves a query per storage command; the proxy read path is per asset
 * request.
 */
export async function currentWorkspaceId(): Promise<WorkspaceId> {
  if (resolvedWorkspaceId) return resolvedWorkspaceId
  const row = await db.query.settings.findFirst({ columns: { id: true } })
  if (!row?.id) throw new WorkspaceNamespaceUnresolvable('this database has no settings row')
  resolvedWorkspaceId = row.id
  return row.id
}

/** Test seam: pin the namespace to a known id, or clear it. */
export function __setWorkspaceIdForTests(id: WorkspaceId | null): void {
  resolvedWorkspaceId = id
}

/** The branded id form for a raw UUID, for fixtures that need a namespace. */
export function workspaceIdFromUuid(uuid: string): WorkspaceId {
  return fromUuid('workspace', uuid)
}

/**
 * Whether an object name lies inside *some* workspace's namespace:
 * `w/<valid workspace TypeID>/<rest>`. A stored key can itself begin with `w/`
 * (upload prefixes are caller-chosen), so the literal root alone does not make
 * a name namespaced; the second segment has to be a workspace id.
 */
export function isWorkspaceNamespacedName(objectName: string): boolean {
  const [root, id, ...rest] = objectName.split('/')
  return root === WORKSPACE_NAMESPACE_ROOT && rest.length > 0 && !!id && isTypeId(id, 'workspace')
}

/**
 * A stored key → the name of the object in the bucket.
 *
 * The only place the namespace is applied. Throws
 * {@link StorageNamespaceViolation} rather than returning anything when the
 * result would not be inside the namespace.
 */
export function composeNamespacedKey(workspaceId: WorkspaceId, key: string): string {
  const namespace = workspaceNamespace(workspaceId)
  const objectName = `${namespace}${key}`

  const refuse = (reason: string): never => {
    throw new StorageNamespaceViolation(workspaceId, key, reason)
  }

  // Restated rather than assumed. It is trivially true of the line above and
  // would stop being true the moment composition grows a special case, which is
  // precisely when nobody would think to re-derive it.
  if (!objectName.startsWith(namespace)) refuse('composition did not produce a namespaced name')

  // An empty key composes to the namespace itself. That names a prefix, not an
  // object, and a request for it is bucket-listing-shaped rather than
  // object-shaped — the one operation this module deliberately cannot express.
  if (objectName.length === namespace.length) refuse('the key is empty')

  if (Buffer.byteLength(objectName, 'utf8') > MAX_OBJECT_NAME_BYTES) {
    refuse(`the composed name exceeds ${MAX_OBJECT_NAME_BYTES} bytes`)
  }

  assertCanonical(namespace, objectName, refuse)

  // One round of percent-decoding, because more than one layer between a
  // request and a bucket decodes before it addresses — this app's own
  // `/api/storage` route calls `decodeURIComponent` on the path — and to those
  // layers `%2e%2e%2f` is `../`. A key that is canonical only until something
  // downstream decodes it is not canonical.
  //
  // No written key can contain `%`: `generateStorageKey` sanitises filenames to
  // `[a-zA-Z0-9.-]`, and the two hand-built key shapes (`exports/<id>.zip`, a
  // content hash plus an extension) cannot either. So this costs nothing on
  // every real key and refuses the ones that only arrive from outside.
  if (objectName.includes('%')) {
    let decoded: string
    try {
      decoded = decodeURIComponent(objectName)
    } catch {
      return refuse('the key contains malformed percent-encoding')
    }
    assertCanonical(namespace, decoded, refuse)
  }

  return objectName
}

/**
 * The invariant, stated once for a name and once for its decoded form.
 *
 * "Is its own normal form, and that form starts with the namespace" is the
 * single property. `.` and `..` segments, an absolute key, a doubled slash and a
 * trailing slash all fail it for the same reason rather than needing a rule
 * each — which is what makes this one check rather than a list that can be
 * incomplete.
 */
function assertCanonical(
  namespace: string,
  candidate: string,
  refuse: (reason: string) => never
): void {
  if (!candidate.startsWith(namespace)) {
    refuse(`it resolves to ${JSON.stringify(candidate)}, outside the namespace`)
  }
  if (hasControlCharacter(candidate)) refuse('it contains a control character')
  // Not a path separator here, but it is to Windows clients, to some proxies,
  // and to anything that normalises before signing. A key nobody can produce is
  // a key nobody should be able to read.
  if (candidate.includes('\\')) refuse('it contains a backslash')

  for (const segment of candidate.split('/')) {
    if (segment === '') refuse('it contains an empty path segment')
    if (segment === '.' || segment === '..') refuse('it contains a relative path segment')
  }
}
