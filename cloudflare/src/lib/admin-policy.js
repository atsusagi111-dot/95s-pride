// 管理画面を使わせないメールアドレス(運営として登録されていても、招待されても、操作できない)
// 団体の共用アドレス(公式アドレス)は、複数人が使う可能性があるため、管理の操作から外している
export const BLOCKED_ADMIN_EMAILS = ['95spride.official@gmail.com'];

export function isBlockedAdmin(email) {
  return BLOCKED_ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase());
}
