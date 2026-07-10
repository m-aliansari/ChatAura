# Bug postmortems

Bugs that were **fixed**, kept because the _underlying hazard_ usually outlives the fix. Each
entry records what broke, why, and — verified against the current `master` — whether the shape
that allowed it still exists somewhere in the codebase.

Every one of these was caught by something **running the code**, not by reading it. Three were
caught by machinery already in the repo (CI, an adversarial spec, the secret scanner). Trust the
gates over your own reading of a diff.

---

## 1. Connect-time race: socket.io silently drops unlistened events

**Symptom.** Flaky 30s timeouts in the integration suite. A client sent a message and the ack
never came, so `emitWithAck` hung forever. Initially misdiagnosed as a slow Docker daemon.

**Root cause.** `index.ts` registers every `socket.on(...)` handler **after**
`await initializeUser(socket)`. Stage 3's first draft emitted `FRIENDS_LIST` in the _middle_ of
`initializeUser`, then did another async DB round-trip (`getRecentMessagesForConversations`)
before returning. A client that sent the instant it received `FRIENDS_LIST` beat the
`DIRECT_MESSAGE` listener registration — and **socket.io drops an event with no listener,
silently**. No error, no ack, no log. Just a hang.

**Fix.** `initializeUser` now does all its awaits first and emits `FRIENDS_LIST` + `MESSAGES`
**last** (`utils/socket/initializeUser.ts:44-45`), so the caller registers listeners on the very
next microtask — long before a network round-trip can deliver the client's reply.

**⚠️ Hazard still present.** `packages/server/index.ts:67` still awaits `initializeUser` before
registering handlers at lines 74-96. Anyone adding an `await` _after_ the emits in
`initializeUser` reopens the window. The invariant is: **nothing may await between the last emit
and the function returning.** The durable fix is to register listeners before (or without)
awaiting `initializeUser`.

---

## 2. Pagination cursor lost microseconds (`timestamptz` µs vs JS `Date` ms)

**Symptom.** `getFriendsPage` silently skipped friends and ended pagination early. Passed locally
for weeks; failed only in CI.

**Root cause.** Postgres `timestamptz` stores **microseconds**; `node-postgres` parses it into a
JS `Date`, which holds **milliseconds**. Building the cursor from `created_at.toISOString()`
truncated it _downward_, so the row-comparison `(created_at, user_id) < (cursor…)` excluded every
friend created later within the same millisecond.

```
pg Date  -> 2026-07-09T19:41:54.886Z        <- 292µs discarded
pg text  -> 2026-07-10 00:41:54.886292+05
```

Invisible locally because inserts were >1ms apart. CI's faster machine put several friendships in
the same millisecond, so it lost rows. **A test that only fails on faster hardware is a data-loss
bug, not a flake.**

**Fix.** Select `created_at::text` so the cursor keeps full precision and round-trips exactly
through the `::timestamptz` cast (`db/repositories/friendships.ts:118`). Guarded by a regression
test that forces all friendships into one millisecond with distinct microseconds — it collects 3
of 7 friends before the fix, 7 of 7 after.

**Status.** No other Date-based cursors remain; `messages` paginates on the `bigserial id`
(`db/repositories/messages.ts:36,39`). **Never build a cursor from a `timestamptz` read into a
`Date`** — use a monotonic surrogate key, or carry the timestamp as text.

---

## 3. Validation lived in transport middleware, so writers bypassed it

**Symptom.** The dev seeder created a user `demo` (4 chars). Postgres accepted it. Logging in
returned **422**.

**Root cause.** `validateForm` is Express middleware: it guards HTTP _requests_, not the
_operation_. The seeder wrote straight through the `addUser` repository, so `authFormSchema`
never ran. Nothing at the DB level backs the rule up, and for the password it **cannot** — the
column only ever sees a bcrypt hash, so `min(6)` on plaintext is unenforceable there by
construction. (`users.username` is only `varchar(28)` + `UNIQUE`: no lower bound, no charset
rule.)

**Fix.** Preconditions moved to the operation. `services/registerUser.ts` validates → checks
uniqueness → hashes → inserts, and both `handleRegister` and `scripts/seed.ts` call it. `addUser`
went back to being a dumb data-access primitive.

`validateForm` stays on the route as a fast-fail second checkpoint. **Enforcing at several
boundaries is good; defining the rule twice is not** — both read the same `authFormSchema` from
`common`. (This is also why a `CHECK (length(username) >= 6)` was rejected: it would be a second
copy of the rule, in another language, in another layer, and tightening it later would fail the
migration against existing rows. DB constraints are for _invariants_ — `UNIQUE`, `NOT NULL`,
`CHECK (user_a_id < user_b_id)` — not for _policy_.)

**⚠️ Hazard still present.** Two write paths still call `addUser` directly and can create
un-loginable users:

- `packages/server/routers/testRouter.ts:36` — the E2E seed route (mounted when
  `ENABLE_TEST_SEED=true`). A short username here would break E2E login confusingly.
- `packages/server/test/integration/helpers.ts:16` — `insertUser` fixture.

---

## 4. Reading context during render crashed partial consumers

**Symptom.** Adding the infinite-scroll spinner made `xss.adversarial.test.jsx` fail — a test
that has nothing to do with scrolling.

**Root cause.** The loader made `ChatMessages` read `conversationMeta[friend.user_id]` during
**render**. Previously it was only touched inside the scroll handler, so a consumer supplying a
partial `MessagesContext` never noticed. Once it moved into render, any such consumer crashed on
mount.

**Fix.** Null-safe reads (`ChatMessages.jsx:94,245`).

**⚠️ Hazard still present.** `SideBar.jsx:93` reads `friendsMeta.loading` **without** optional
chaining. Its provider always supplies the value today, so it works — the same thing that was
true of `ChatMessages` before the loader landed.

**Lesson.** Moving a context read from an event handler into render changes its contract from
"present when the user scrolls" to "present on every mount." The full suite catches this; a
targeted test run does not.

---

## 5. A credential pair in a test fixture, and a hole in the ignore config

**Symptom.** GitGuardian failed the PR: _1 secret uncovered_. Detector `Username Password`, file
`services/registerUser.test.ts`.

**Root cause.** The fixture `{ username: "demouser", password: "secret1" }` is a credential
_pair_ on one line. Nothing to rotate — but source shouldn't carry one even when it's fake, and
"it's only a test" is exactly the reasoning that eventually lets a real secret through.

Two things worth remembering:

- **A follow-up commit does not remove a secret.** The scanner reads _every commit in the PR_.
  Pushing the fix as a third commit took the report from "1 secret in 2 commits" to "1 secret in
  3 commits." It took a history rewrite (`git reset --soft` + recommit + `--force-with-lease`) to
  clear it.
- GitHub retains PR commits under `refs/pull/<n>/*` **indefinitely**, so the orphaned commit
  remains fetchable even after the rewrite. GitGuardian incident `34698885` will not self-resolve.

**Fix.** Named fixtures, so no username/password literal pair appears.

**⚠️ Hazard still present.** `.gitguardian.yaml` ignores `**/*.test.js`, `**/*.test.jsx`,
`**/test/**`, and `**/e2e/**` — but **not `**/*.test.ts`**, even though `server` and `common` are
TypeScript. The JS test suites are full of fixture pairs (`Login/index.test.jsx:53`,
`Signup/index.test.jsx:51`) and pass; the first `.test.ts` to contain one failed CI. The coverage
is inconsistent by accident, not by intent.

Resolve it deliberately in one of two directions — do not just widen the ignore by reflex:

- **Stricter:** drop the ignores and keep credential pairs out of _all_ source. Costs a cleanup
  of the existing JS specs; leaves scanning fully armed.
- **Consistent:** add `**/*.test.ts` (and `**/*.int.test.ts`) to `ignored-paths`. Cheap, but a
  real secret pasted into a TS test would then go unnoticed.

---

## The pattern

| #   | Found by                                           | Would code review have caught it?               |
| --- | -------------------------------------------------- | ----------------------------------------------- |
| 1   | Integration suite + a targeted socket reproduction | No — the emit looked fine in isolation          |
| 2   | CI, on faster hardware                             | No — `toISOString()` reads as obviously correct |
| 3   | A human asking "how did a 4-char username exist?"  | Maybe                                           |
| 4   | An unrelated adversarial spec                      | No                                              |
| 5   | The secret scanner                                 | Unlikely — it's a test fixture                  |

Fixing a bug removes an instance. Recording the hazard is what removes the class.
