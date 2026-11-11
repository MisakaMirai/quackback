/**
 * Human-readable messages for the `?error=<code>` values a sign-in can
 * land with. Two producers feed this map:
 *
 *  - our own pre-checks (`handleSignInPreCheck` / `auth-restrictions`),
 *    which 302 to the login surface with a code, and
 *  - Better-Auth's OAuth/OIDC callback pipeline (`redirectOnError`),
 *    whose codes arrive on the `errorCallbackURL`.
 *
 * Shared (not server-only) because client-bundled route files render
 * these messages directly (popup landing, login toast).
 */

/** Closed set of codes the producers emit. Adding a producer-side code
 *  without listing it here makes the auth client fall back to the
 *  generic message — TypeScript won't catch that for you because the
 *  producer side types these as `error?: string`. Keep both sides in
 *  sync. */
export type AuthBlockCode =
  | 'password_method_not_allowed'
  | 'magic_link_method_not_allowed'
  | 'oauth_method_not_allowed'
  | 'auth_method_blocked'
  | 'rate_limited'
  | 'verified_domain_requires_sso'
  | 'require_two_factor'
  | 'token_expired'
  | 'invalid_token'
  | 'signup_disabled'
  | 'signup_not_allowed'
  | 'OAUTH_CALLBACK_ERROR'
  | 'oauth_signin_error'
  | 'not_team_member'
  | 'reserved_email_domain'
  // Better-Auth OAuth/OIDC callback codes (redirectOnError in the
  // generic-oauth plugin and the linking pipeline). These arrive as
  // `?error=<code>` on the errorCallbackURL, not from our pre-checks.
  | 'account_not_linked'
  // Better Auth 1.7 renamed the apostrophe spelling; keep both so a
  // leftover 1.6 redirect or a mixed-version hop still renders.
  | "email_doesn't_match"
  | 'email_does_not_match'
  | 'account_already_linked_to_different_user'
  | 'unable_to_link_account'
  | 'email_is_missing'
  | 'user_info_is_missing'
  | 'email_not_found'
  | 'state_mismatch'
  | 'please_restart_the_process'
  | 'oauth_code_verification_failed'
  | 'invalid_code'
  | 'no_code'
  | 'unable_to_create_user'
  // The magic-link plugin's own spelling of the same event. Better-Auth emits
  // `unable_to_create_user` from the OAuth callback and `failed_to_create_user`
  // from `/magic-link/verify`; both are real codes and both land on a browser.
  | 'failed_to_create_user'
  | 'unable_to_create_session'
  | 'oauth_provider_not_found'
  | 'handoff_failed'

export const AUTH_BLOCK_MESSAGES: Record<AuthBlockCode, string> = {
  password_method_not_allowed: '此工作区未启用密码登录。请改用邮件登录链接或 SSO。',
  magic_link_method_not_allowed: '此工作区未启用邮件登录链接。',
  oauth_method_not_allowed: '此工作区未启用该登录提供商。',
  auth_method_blocked: '你的账户不允许使用该登录方式。',
  rate_limited: '登录尝试次数过多，请稍候再试。',
  reserved_email_domain: '该邮箱域名已被保留，不能用于登录。请使用你自己的邮箱地址。',
  verified_domain_requires_sso: '你的邮箱所在域名要求使用单点登录。请选择 SSO 继续。',
  require_two_factor: '需要两步验证，请验证你的第二重身份。',
  token_expired: '你的登录链接已过期，请重新获取。',
  invalid_token: '你的登录链接无效或已被篡改，请重试。',
  signup_disabled: '你的账户尚未为 SSO 预先开通。请先让管理员邀请你。',
  signup_not_allowed: '此工作区目前不接受新账户。请让管理员邀请你，然后使用受邀账户登录。',
  OAUTH_CALLBACK_ERROR: '登录失败，你的身份提供商拒绝了该请求。请检查 IdP 中的应用配置后重试。',
  oauth_signin_error: '登录失败，你的身份提供商拒绝了该请求。请检查 IdP 中的应用配置后重试。',
  not_team_member: '此账户没有团队访问权限。团队成员仅限受邀加入，请联系管理员。',
  account_not_linked:
    '该邮箱已有账户。请用你原来的方式登录（例如邮件登录链接）以确认身份，之后 SSO 登录会关联到此账户。',
  "email_doesn't_match":
    '身份提供商返回的邮箱与你的账户不一致。请使用相同邮箱地址的 IdP 账户登录。',
  email_does_not_match: '身份提供商返回的邮箱与你的账户不一致。请使用相同邮箱地址的 IdP 账户登录。',
  account_already_linked_to_different_user:
    '该身份已关联到其他账户。请使用其他 IdP 账户登录，或联系管理员。',
  unable_to_link_account: '连接登录时出错，请重试。',
  email_is_missing: '你的身份提供商未提供邮箱地址。请让管理员为此应用启用邮箱范围。',
  user_info_is_missing:
    '你的身份提供商未提供可用的个人资料。请让管理员释放邮箱地址，或映射包含邮箱的声明。',
  email_not_found: '你的身份提供商未提供邮箱地址。请让管理员为此应用启用邮箱范围。',
  state_mismatch: '该登录尝试已过期或已被使用，请重试。',
  please_restart_the_process: '该登录尝试已过期或已被使用，请重试。',
  oauth_code_verification_failed: '无法通过你的身份提供商验证此次登录，请重试。',
  invalid_code: '无法通过你的身份提供商验证此次登录，请重试。',
  no_code: '无法通过你的身份提供商验证此次登录，请重试。',
  unable_to_create_user: '创建账户时出错，请重试。',
  failed_to_create_user:
    '无法通过该链接创建账户。链接可能已过期，或此工作区不接受新账户。请让管理员邀请你，然后使用其发送的链接。',
  unable_to_create_session: '登录时出错，请重试。',
  oauth_provider_not_found: '该登录提供商当前不可用，可能已被管理员禁用。',
  handoff_failed: '该工作区交接已过期或已被使用。请在此登录，或从 Quackback 重新打开工作区。',
}
