# Firestore Security Specification (Phase 0)

## Data Invariants
1. Every document under `/users/{userId}` and its subcollections (`memories`, `chats`, `messages`) is strictly private to the authenticated, email-verified user whose `request.auth.uid == userId`.
2. Every document ID (`userId`, `memoryId`, `chatId`, `messageId`) must match `^[a-zA-Z0-9_-]+$` and be `<= 128` characters.
3. No unverified email (`email_verified != true`) may read or write user data.
4. `userId` and `createdAt` are immutable on all updates; `createdAt` and `updatedAt` must equal `request.time`.
5. Messages under `/users/{userId}/chats/{chatId}/messages/{messageId}` require the parent `/users/{userId}/chats/{chatId}` document to exist and belong to `userId`.
6. No shadow fields or unvalidated types are permitted; strict `keys().hasAll(...)` / `keys().hasOnly(...)` on create and `affectedKeys().hasOnly(...)` + `isValid[Entity](incoming())` on update.

## Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read/write to `/users/uid1`.
2. Authenticated user `uid2` reading `/users/uid1` or listing `/users/uid1/memories`.
3. Authenticated user with `email_verified: false` attempting to create `/users/uid1`.
4. Shadow field injection: `create` on `/users/uid1` with extra `isAdmin: true` field.
5. Identity spoofing: `create` on `/users/uid1/memories/mem1` with `userId: "uid2"`.
6. Client-forged timestamp: `create` on `/users/uid1/memories/mem1` with `createdAt: "2026-01-01T00:00:00Z"` instead of server timestamp.
7. Oversized memory content: `create` on `/users/uid1/memories/mem1` with 2,000-char `content` (limit 600).
8. Invalid enum value: `update` on `/users/uid1/memories/mem1` with `category: "admin_override"`.
9. Immutable field mutation: `update` on `/users/uid1/chats/c1` attempting to modify `createdAt` or `userId`.
10. Orphaned message write: `create` on `/users/uid1/chats/nonexistent/messages/m1`.
11. Poisoned document ID: `create` on `/users/uid1/memories/../../admin` or 200-char ID.
12. Root collection listing: `list` on `/users` to enumerate user PII/emails.
