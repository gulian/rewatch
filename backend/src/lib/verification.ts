// Email verification policy: 7-day grace period after account creation,
// reminder one day before the deadline (daily job), then blocked until verified.
export const VERIFY_GRACE_MS = 7 * 24 * 60 * 60 * 1000
export const REMINDER_BEFORE_MS = 24 * 60 * 60 * 1000

type VerifiableUser = { emailVerifiedAt: Date | null; createdAt: Date }

export const verifyDeadline = (user: VerifiableUser): Date | null =>
  user.emailVerifiedAt ? null : new Date(user.createdAt.getTime() + VERIFY_GRACE_MS)

export const isBlocked = (user: VerifiableUser): boolean => {
  const deadline = verifyDeadline(user)
  return deadline !== null && deadline < new Date()
}
