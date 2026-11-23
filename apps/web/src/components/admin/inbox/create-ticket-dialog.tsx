import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { useIntl } from 'react-intl'
import { toast } from 'sonner'
import { PaperClipIcon, XMarkIcon } from '@heroicons/react/24/solid'
import type { JSONContent } from '@tiptap/react'
import type { ConversationId, PrincipalId, TicketId, TicketTypeId } from '@quackback/ids'
import type { TicketType, TiptapContent } from '@/lib/shared/db-types'
import { TICKET_TYPES } from '@/lib/shared/db-types'
import type { TicketTypeDTO } from '@/lib/shared/tickets'
import { useCreateTicket } from '@/lib/client/mutations/inbox'
import { ticketQueries } from '@/lib/client/queries/inbox'
import { linkTicketToConversationFn } from '@/lib/server/functions/tickets'
import { ticketTypeLabel } from '@/components/admin/inbox/ticket-chips'
import { realEmail } from '@/lib/shared/anonymous-email'
import { PortalUserPicker } from '@/components/shared/portal-user-picker'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { TicketFormFields } from '@/components/shared/ticket-form-fields'
import { useTicketIntakeForm } from '@/components/shared/use-ticket-intake-form'
import { CONVERSATION_EDITOR_FEATURES } from '@/components/conversation/conversation-editor-features'
import { ComposerAttachmentTray } from '@/components/shared/composer-attachment-tray'
import { isEmptyTiptapDoc } from '@/lib/shared/utils/is-empty-tiptap-doc'
import { useAgentFileUpload } from '@/lib/client/hooks/use-file-upload'
import { useConversationComposerAttachments } from '@/lib/client/hooks/use-conversation-composer-attachments'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toastError } from '@/lib/client/error-notice'

// Native `<textarea maxLength>` used to silently cap this field; a rich doc
// can't be truncated mid-node without corrupting it, so the cap is now
// enforced pre-submit with the same toast the dialog already uses for
// mutation errors.
const DESCRIPTION_MAX_LENGTH = 4000

interface Requester {
  principalId: string
  name: string | null
  email: string | null
  image?: string | null
}

export interface CreateTicketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the new ticket's id on success (both standalone and
   *  from-a-conversation flows) — the caller navigates to it. */
  onCreated: (ticketId: TicketId) => void
  /** Set when opened from a conversation (unified inbox §M5's create-ticket
   *  flow: header icon, the panel's Ticket card empty slot, or the command
   *  bar with a conversation active). Defaults the type to the customer
   *  category, fixes the requester to the conversation's visitor (no picker),
   *  and links the new ticket back to this conversation on success. */
  conversationId?: ConversationId
  /** Prefill from the conversation's subject or first message. Only read
   *  when `conversationId` is set (the standalone flow starts blank). */
  defaultTitle?: string
  /** The conversation's visitor, prefilled as the fixed requester. Only read
   *  when `conversationId` is set. */
  defaultRequester?: Requester | null
  /** Refresh the caller's lists/thread after a successful create (+ link) —
   *  the conversation thread gains a system note announcing the ticket. */
  onChanged?: () => void
}

/** The create-dialog preselection: the customer category's default type, else
 *  the first candidate (a workspace whose customer types are all archived). */
function preselectedType(candidates: TicketTypeDTO[]): TicketTypeDTO | null {
  return (
    candidates.find((t) => t.category === 'customer' && t.isDefault) ??
    candidates.find((t) => t.category === 'customer') ??
    candidates[0] ??
    null
  )
}

/**
 * Open a ticket. Standalone (no `conversationId`): pick a type + title, and
 * optionally attach a requester — the general-purpose flow (command bar with
 * no conversation active, or the pre-unified tickets page). From a
 * conversation (`conversationId` set): the type defaults to the customer
 * category but the whole registry stays on offer (a back-office task spun off
 * the conversation keeps it as provenance — the service decides pair vs
 * provenance from the type), the requester is fixed to the conversation's
 * visitor, and a successful create links the ticket back to the conversation
 * (`linkTicketToConversationFn`) — a friendly conflict (one customer ticket
 * per conversation, already linked) still counts as "created", just not
 * (re-)linked.
 *
 * CONVERGENCE PHASE 4: the type picker lists the workspace's registry types;
 * the chosen type drives the category (derived server-side) and swaps the
 * dynamic field set rendered from its `fields[]`, validated into
 * `customAttributes` on submit. A workspace with no live registry types keeps
 * the legacy bare-category picker.
 *
 */
export const CreateTicketDialog = memo(function CreateTicketDialog({
  open,
  onOpenChange,
  onCreated,
  conversationId,
  defaultTitle,
  defaultRequester,
  onChanged,
}: CreateTicketDialogProps) {
  const intl = useIntl()
  const fromConversation = !!conversationId
  const [type, setType] = useState<TicketType>('customer')
  const [title, setTitle] = useState('')
  const [descriptionJson, setDescriptionJson] = useState<JSONContent | undefined>(undefined)
  const [descriptionMarkdown, setDescriptionMarkdown] = useState('')
  const [requester, setRequester] = useState<Requester | null>(null)

  // The registry types the picker offers (live rows only) — the same set in
  // both flows. From a conversation a customer type opens the pair, while a
  // back-office or tracker type opens internal work that keeps this
  // conversation as its provenance; the preselection below still lands on
  // customer, which is the common case.
  const { data: registryTypes } = useQuery(ticketQueries.types())
  const candidates = useMemo(
    () => (registryTypes ?? []).filter((t) => !t.archived),
    [registryTypes]
  )
  // The shared intake plumbing; the agent path resolves its selection through
  // its own preselection effects (no implicit fallback) and validates the
  // type's FULL field set (customer-hidden fields included).
  const {
    selectedTypeId,
    selectedType,
    fields: selectedFields,
    fieldValues,
    fieldErrors,
    setSelectedTypeId,
    setFieldValues,
    setFieldErrors,
    setFieldValue,
    selectType: selectIntakeType,
    validate,
  } = useTicketIntakeForm(candidates, {
    resolveSelectedType: (types, id) => types.find((t) => t.id === id) ?? null,
    includeInternal: true,
  })

  // A fresh open starts clean — prefilled from the conversation when opened
  // in that mode, with the category default type preselected. `candidates` is
  // intentionally read at open time only — a mid-dialog registry refresh must
  // not yank the agent's selection (the follow-up effect below only applies
  // the preselection while nothing is selected).
  useEffect(() => {
    if (open) {
      setType('customer')
      setSelectedTypeId(preselectedType(candidates)?.id ?? null)
      setTitle(fromConversation ? (defaultTitle ?? '') : '')
      setDescriptionJson(undefined)
      setDescriptionMarkdown('')
      clearAttachments()
      setRequester(fromConversation ? (defaultRequester ?? null) : null)
      setFieldValues({})
      setFieldErrors({})
    }
  }, [open, fromConversation, defaultTitle, defaultRequester])

  // The types query is async: when the dialog opens before the registry has
  // arrived, preselect as soon as it lands (only while nothing is selected —
  // an agent's own pick is never overridden).
  useEffect(() => {
    if (open && selectedTypeId === null && candidates.length > 0) {
      setSelectedTypeId(preselectedType(candidates)?.id ?? null)
    }
  }, [open, candidates, selectedTypeId])

  const create = useCreateTicket()
  const { upload } = useAgentFileUpload()
  const {
    items,
    attachments,
    addFiles,
    remove: removeAttachment,
    retry: retryAttachment,
    clear: clearAttachments,
    uploading,
  } = useConversationComposerAttachments(upload)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Paste still works for an image from the clipboard; drop/paste now accept
  // any file, same as the paperclip picker.
  const handleComposerPaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      void addFiles(files)
    },
    [addFiles]
  )
  const handleComposerDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      void addFiles(files)
    },
    [addFiles]
  )
  const [linking, setLinking] = useState(false)
  const canCreate = title.trim().length > 0 && !create.isPending && !linking && !uploading

  /** Type swap: change the field set and drop the old type's answers (the
   *  retype rule protects STORED answers, not a draft's stale keys). */
  const selectType = (id: string) => {
    selectIntakeType(id)
  }

  const submit = () => {
    if (!canCreate) return
    const description = descriptionMarkdown.trim()
    if (description.length > DESCRIPTION_MAX_LENGTH) {
      toast.error(
        intl.formatMessage(
          {
            id: 'admin.inbox.createTicket.descriptionTooLong',
            defaultMessage: 'Description is too long (max {max} characters).',
          },
          { max: DESCRIPTION_MAX_LENGTH }
        )
      )
      return
    }

    // Registry-typed create: validate the answers into customAttributes with
    // the same validator the server enforces (agents fill the type's full
    // field set, customer-hidden fields included).
    let customAttributes: Record<string, unknown> | undefined
    if (selectedType) {
      const result = validate()
      if (!result.ok) return
      customAttributes = Object.keys(result.values).length > 0 ? result.values : undefined
    }

    create.mutate(
      {
        // A chosen registry type DERIVES the category server-side (the legacy
        // bare-category path only remains for a typeless workspace).
        type: selectedType ? undefined : type,
        ticketTypeId: (selectedType?.id ?? undefined) as TicketTypeId | undefined,
        title: title.trim(),
        description: description || undefined,
        descriptionJson: isEmptyTiptapDoc(descriptionJson as TiptapContent | undefined)
          ? null
          : (descriptionJson as TiptapContent),
        attachments: attachments.length > 0 ? attachments : undefined,
        requesterPrincipalId: requester?.principalId as PrincipalId | undefined,
        customAttributes,
        // Lets the create inherit this conversation's assignee (born owned by
        // whoever owns the conversation); the link row itself is written by
        // the linkTicketToConversationFn step below.
        sourceConversationId: conversationId,
      },
      {
        onSuccess: async (ticket) => {
          if (conversationId) {
            setLinking(true)
            try {
              await linkTicketToConversationFn({ data: { ticketId: ticket.id, conversationId } })
              toast.success(
                intl.formatMessage({
                  id: 'admin.inbox.createTicket.created',
                  defaultMessage: 'Ticket created',
                })
              )
            } catch (error) {
              // The ticket itself was created successfully — a link failure
              // (e.g. this conversation already has one) is a secondary,
              // recoverable problem, not a reason to hide the new ticket.
              const testLinkConflict =
                (error as { code?: string } | null)?.code === 'TEST_DATA_LINK_CONFLICT' ||
                (error instanceof Error &&
                  error.message === 'Test and real conversations need separate tickets.')
              toast.warning(
                testLinkConflict
                  ? intl.formatMessage({
                      id: 'support.ticket.createDialog.testDataLinkConflict',
                      defaultMessage: 'Test and real conversations need separate tickets.',
                    })
                  : error instanceof Error
                    ? intl.formatMessage(
                        {
                          id: 'admin.inbox.createTicket.linkFailedWithError',
                          defaultMessage: "Ticket created, but couldn't link it: {error}",
                        },
                        { error: error.message }
                      )
                    : intl.formatMessage({
                        id: 'admin.inbox.createTicket.linkFailed',
                        defaultMessage: "Ticket created, but couldn't link it to this conversation",
                      })
              )
            } finally {
              setLinking(false)
            }
          } else {
            toast.success(
              intl.formatMessage({
                id: 'admin.inbox.createTicket.created',
                defaultMessage: 'Ticket created',
              })
            )
          }
          onOpenChange(false)
          onCreated(ticket.id)
          onChanged?.()
        },
        onError: (error) =>
          toastError(
            error,
            intl.formatMessage({
              id: 'admin.inbox.createTicket.failed',
              defaultMessage: 'Failed to create ticket',
            })
          ),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {fromConversation
              ? intl.formatMessage({
                  id: 'admin.inbox.createTicket.create',
                  defaultMessage: 'Create ticket',
                })
              : intl.formatMessage({
                  id: 'admin.inbox.createTicket.new',
                  defaultMessage: 'New ticket',
                })}
          </DialogTitle>
          <DialogDescription>
            {fromConversation
              ? intl.formatMessage({
                  id: 'admin.inbox.createTicket.descriptionConversation',
                  defaultMessage: 'Open a trackable ticket for this conversation.',
                })
              : intl.formatMessage({
                  id: 'admin.inbox.createTicket.descriptionStandalone',
                  defaultMessage: 'Open a trackable request and set who it is for.',
                })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* The type picker: registry types when the workspace has them
              (always, post-0215 — unless every one is archived), else the
              legacy bare-category picker. */}
          {candidates.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  {intl.formatMessage({ id: 'admin.inbox.toolbar.type', defaultMessage: 'Type' })}
                </label>
              </div>
              <Select value={selectedTypeId ?? ''} onValueChange={selectType}>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={intl.formatMessage({
                      id: 'admin.inbox.createTicket.typePlaceholder',
                      defaultMessage: 'Select a type…',
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <span aria-hidden>{t.icon}</span>
                        <span>{t.name}</span>
                        <span className="text-muted-foreground">
                          · {ticketTypeLabel(t.category)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {intl.formatMessage({ id: 'admin.inbox.toolbar.type', defaultMessage: 'Type' })}
              </label>
              <Select value={type} onValueChange={(v) => setType(v as TicketType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ticketTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {intl.formatMessage({ id: 'inbox.convert.titleLabel', defaultMessage: 'Title' })}
            </label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              placeholder={intl.formatMessage({
                id: 'admin.inbox.createTicket.titlePlaceholder',
                defaultMessage: 'Summarize the request…',
              })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {intl.formatMessage({
                id: 'admin.inbox.createTicket.descriptionLabel',
                defaultMessage: 'Description',
              })}
            </label>
            <div onPaste={handleComposerPaste} onDrop={handleComposerDrop}>
              <RichTextEditor
                value={descriptionJson ?? ''}
                onDocumentChange={(document) => {
                  setDescriptionJson(document.json())
                  setDescriptionMarkdown(document.markdown())
                }}
                features={CONVERSATION_EDITOR_FEATURES}
                minHeight="120px"
                placeholder={intl.formatMessage({
                  id: 'admin.inbox.createTicket.descriptionPlaceholder',
                  defaultMessage: 'Add details (optional). This opens the ticket thread.',
                })}
              />
              <ComposerAttachmentTray
                items={items}
                onRemove={removeAttachment}
                onRetry={retryAttachment}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files
                  if (files && files.length > 0) void addFiles(files)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                aria-label={intl.formatMessage({
                  id: 'admin.inbox.createTicket.attachFiles',
                  defaultMessage: 'Attach files',
                })}
              >
                <PaperClipIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* The chosen type's field set — agents fill the full set (customer-
              hidden fields included); answers validate into customAttributes.
              Phase 5: suggestion provenance markers ride suggestedKeys. */}
          <TicketFormFields
            fields={selectedFields}
            values={fieldValues}
            onChange={setFieldValue}
            errors={fieldErrors}
          />

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {fromConversation
                ? intl.formatMessage({
                    id: 'admin.inbox.contact.requester',
                    defaultMessage: 'Requester',
                  })
                : intl.formatMessage({
                    id: 'admin.inbox.createTicket.requesterOptional',
                    defaultMessage: 'Requester (optional)',
                  })}
            </label>
            {requester ? (
              <div className="flex items-center gap-2.5 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <Avatar
                  src={requester.image}
                  name={
                    requester.name ??
                    intl.formatMessage({
                      id: 'admin.inbox.createTicket.userFallback',
                      defaultMessage: 'User',
                    })
                  }
                  className="size-7 text-xs"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">
                    {requester.name ||
                      intl.formatMessage({
                        id: 'common.userPicker.unnamed',
                        defaultMessage: 'Unnamed user',
                      })}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {realEmail(requester.email) ??
                      intl.formatMessage({
                        id: 'common.userPicker.noEmail',
                        defaultMessage: 'No email',
                      })}
                  </span>
                </span>
                {/* The conversation's visitor is fixed — only the standalone
                    flow's picked requester can be cleared. */}
                {!fromConversation && (
                  <button
                    type="button"
                    onClick={() => setRequester(null)}
                    aria-label={intl.formatMessage({
                      id: 'admin.inbox.createTicket.clearRequester',
                      defaultMessage: 'Clear requester',
                    })}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <XMarkIcon className="size-4" />
                  </button>
                )}
              </div>
            ) : fromConversation ? (
              <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                {intl.formatMessage({
                  id: 'admin.inbox.createTicket.anonymousVisitor',
                  defaultMessage: 'Anonymous visitor, no portal account on file.',
                })}
              </p>
            ) : (
              <PortalUserPicker
                onSelect={(u) => setRequester(u)}
                enabled={open && !requester}
                limit={6}
                searchRequired
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
          </Button>
          <Button onClick={submit} disabled={!canCreate}>
            {create.isPending || linking
              ? intl.formatMessage({
                  id: 'admin.inbox.createTicket.creating',
                  defaultMessage: 'Creating…',
                })
              : intl.formatMessage({
                  id: 'admin.inbox.createTicket.create',
                  defaultMessage: 'Create ticket',
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
