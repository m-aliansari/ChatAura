# Designing Normalized Tables — a working reference

A generic, project-agnostic guide for creating new relational tables. Consult it before
adding or reshaping a table so the schema is correct by construction rather than patched
later. Examples are illustrative and not tied to any particular application.

The one-line rule: **every table represents one kind of thing, every column states one
atomic fact about that thing, and every fact is stored in exactly one place.**

---

## The normal forms

Normalization removes redundancy and update anomalies by organizing columns around their
functional dependencies (which columns determine which other columns). Aim for **3NF/BCNF**
by default; go higher only when a specific anomaly demands it.

### 1NF — First Normal Form: atomic, single-valued columns

Every column holds a single, indivisible value; no repeating groups.

**Violations (fix these):**

- **Array / list columns** holding many values: `tags VARCHAR[]`, `phone_numbers TEXT[]`.
- **Comma-separated strings**: `roles = "admin,editor"`.
- **Delimiter-packed fields**: `"id.type.value"` parsed with `split()`.
- **Numbered repeating columns**: `item1`, `item2`, `item3`.

**Fix:** move the repeating values into a **child table**, one row per value:

```
-- Instead of  users(id, ..., phone_numbers TEXT[])
user_phones(
  id         serial PRIMARY KEY,
  user_id    <ref> NOT NULL,
  phone      varchar(32) NOT NULL,
  UNIQUE (user_id, phone)
)
```

> Note on JSON columns: a `jsonb` column is legitimate for genuinely schemaless or
> document-shaped data. It is **not** a license to store a list of first-class entities you
> will query, join, or constrain — those still belong in their own table.

### 2NF — no partial dependency on part of a composite key

Applies only when the primary key is **composite** (multiple columns). Every non-key column
must depend on the **whole** key, not just part of it.

- If a table keyed on `(order_id, product_id)` also stores `product_name`, that name depends
  only on `product_id` → partial dependency → move `product_name` to a `products` table.
- **Tables with a single-column primary key are automatically in 2NF.**

### 3NF — no transitive dependency

No non-key column may depend on another non-key column. Every non-key column depends on
**the key, the whole key, and nothing but the key.**

- A `users` table storing `city` **and** `city_zip` (where `zip` is determined by `city`)
  violates 3NF → the zip depends on city, not on the user.
- **Denormalizing a value that lives in another table** (e.g. copying `username` into a
  `friendships` row when the username belongs to `users`) is the most common 3NF violation
  in practice. Store the reference (the id) and **join** to fetch the label.

### BCNF — Boyce-Codd (a stricter 3NF)

Every determinant (left side of a functional dependency) must be a candidate key. Rarely an
issue in typical designs; it bites when a table has **overlapping composite candidate keys**.
Reaching clean 3NF usually gives BCNF for free.

### 4NF / 5NF — multivalued & join dependencies (know they exist)

- **4NF:** don't put two independent one-to-many facts in the same table (e.g. a person's
  `skills` and their `languages` in one table produces a spurious cross-product). Split into
  two tables.
- **5NF:** decompose only where a lossless join requires it. In day-to-day work, correct 3NF
  design almost always already satisfies these.

---

## Keys

- **Primary key:** pick one per table. A **surrogate key** (`serial` / `bigserial` / `uuid`)
  is a safe default — stable, opaque, never needs to change. A **natural key** (an inherently
  unique business value like an email) can be the PK, but only if it is truly immutable and
  always present.
- **Candidate keys:** a table may have several columns/sets that are each unique (e.g. a
  surrogate `id` plus a natural `email`). Enforce every one of them with a `UNIQUE`
  constraint even if only one is the declared PK. Having multiple candidate keys is normal and
  legal — it is not a normalization violation.
- **Surrogate + natural together:** common and fine — the surrogate is the internal join key;
  the natural key is the externally meaningful lookup. Keep both `UNIQUE`.
- **Foreign vs. soft references:** a real `FOREIGN KEY` gives referential integrity and cascade
  behavior — use it within a cohesive schema. When two areas are meant to be **separable**
  (different services/databases later), reference by a **stable id value without a hard FK**,
  and resolve labels with an application-level or read-time join. Decide this deliberately;
  don't add cross-boundary FKs by reflex.

---

## Modeling relationships

- **One-to-one:** fold into a single table unless you have a strong reason to split (optional
  data, differing access patterns, differing lifecycles). If split, share/reference the key.
- **One-to-many:** the "many" side carries a column referencing the "one" side
  (`child.parent_id`). Never an array on the parent (that's the 1NF trap).
- **Many-to-many:** introduce a **junction (join) table** whose key is the pair of references:

    ```
    post_tags(
      post_id  <ref> NOT NULL,
      tag_id   <ref> NOT NULL,
      PRIMARY KEY (post_id, tag_id)   -- or a surrogate id + UNIQUE(post_id, tag_id)
    )
    ```

- **Self-referential / symmetric relationships** (friendship, "is connected to" — where the
  relationship has **no direction**): store each pair **once**, not twice. Enforce a canonical
  ordering so `(A,B)` and `(B,A)` can't both exist:

    ```
    relationship(
      id      serial PRIMARY KEY,
      a_id    <ref> NOT NULL,
      b_id    <ref> NOT NULL,
      UNIQUE (a_id, b_id),
      CHECK  (a_id < b_id)     -- canonical order => exactly one row per unordered pair
    )
    ```

    Reads select "the other side" with `WHERE a_id = :x OR b_id = :x`. This makes each
    relationship a single fact (one row) — inherently atomic to create/delete, and impossible to
    leave half-written. (A **directed** relationship like "follows" is different: `(follower,
followee)` is ordered, so two rows for a mutual follow is correct.)

---

## Constraints (encode the rules in the schema, not just the app)

- **`NOT NULL`** on every column that must always have a value. Nullable should be a conscious
  choice meaning "genuinely unknown/absent."
- **`UNIQUE`** on every candidate key and every "no duplicates" rule (including composite
  uniqueness on junction/child tables, e.g. `UNIQUE(user_id, token)`).
- **`CHECK`** for domain rules: enums-as-text ranges, non-negative amounts, canonical ordering,
  valid state transitions.
- **`DEFAULT`** for server-supplied values (`created_at TIMESTAMPTZ DEFAULT now()`).
- **`FOREIGN KEY`** with an explicit `ON DELETE` policy (`CASCADE` / `RESTRICT` / `SET NULL`)
  where you want referential integrity — subject to the separability caveat above.
- Prefer **`TIMESTAMPTZ`** over `TIMESTAMP` for instants; store UTC.

---

## Indexing (follows from keys)

- PKs and `UNIQUE` constraints are indexed automatically.
- Add an index on **every foreign/soft-reference column you filter or join on** — child rows
  are almost always fetched by parent id.
- Index columns used in frequent `WHERE` / `ORDER BY`. Don't over-index write-heavy tables;
  each index is write cost.

---

## Naming (pick a convention and hold it)

- Tables: plural nouns (`users`, `fcm_tokens`), `snake_case`.
- Junction tables: both sides (`post_tags`, `user_roles`).
- Columns: `snake_case`; reference columns as `<entity>_id`.
- Timestamps: `created_at`, `updated_at`.
- Booleans: predicate-style (`is_active`, `has_verified_email`).
- Be consistent about which unique id a reference column points at (surrogate PK vs. natural
  key) and encode it in the name if ambiguous.

---

## When denormalization is acceptable

Normalize first. Denormalize **only** as a deliberate, measured optimization:

- You have profiled a real read hot-path that the normalized join can't meet.
- You accept the write-time cost of keeping the copy consistent (triggers, transactional
  dual-writes, or a cache with a clear invalidation story).
- You treat the denormalized copy as a **cache/read-model**, with the normalized table
  remaining the source of truth.

A duplicated value with no consistency mechanism is a bug, not an optimization.

### Worked example in this codebase — `conversation_members.last_message_id`

The inbox ("sort my conversations by latest message") is the one place this app denormalizes on
purpose, and it satisfies every bullet above:

- **The normalized read can't meet the hot path.** The sort key (latest message) lives in
  `messages`, while the filter ("conversations I'm a member of") lives in `conversation_members`.
  Split across two tables, Postgres must gather _all_ my conversations before it can top-N sort —
  work that grows with conversation count on a read that runs on every connect. Co-locating the sort
  key on the member row turns it into a single index range-scan over
  `(user_id, last_message_id DESC NULLS LAST, created_at DESC)` that touches only one page of rows.
- **The write-time cost is accepted and bounded.** `services/sendMessage.ts` keeps the copy correct
  with a **transactional dual-write**: the message `INSERT` and one
  `UPDATE conversation_members … WHERE conversation_id` commit together. The fan-out is bounded by
  that conversation's member count — never system-wide.
- **It's a pointer, not a copy.** `last_message_id` stores `messages.id`, not the message _content_,
  so `messages` stays the single source of truth and the preview is read live through the pointer.
  There is no text to drift.

Note also what is **not** a violation here: `conversations.created_at` and `conversation_members
.created_at` look duplicative but are each the owning row's own fact ("conversation started" vs
"member joined"), and they are immutable — nothing to keep in sync. Contrast with copying
`friendships.created_at` onto a member row, which _would_ be a mirrored mutable-ish value.

---

## Create-a-table checklist

1. **One entity?** The table represents a single kind of thing. If columns describe two
   things, split them.
2. **1NF:** no arrays, CSV strings, delimiter-packed fields, or numbered repeating columns.
3. **Primary key** chosen (surrogate by default); all candidate keys marked `UNIQUE`.
4. **2NF/3NF:** every non-key column depends on the whole key and nothing but the key; no value
   that belongs in another table is copied in — store a reference and join.
5. **Relationships** modeled with reference columns / junction tables; symmetric relations
   stored once with a canonical-order `CHECK`.
6. **Constraints** applied: `NOT NULL`, `UNIQUE`, `CHECK`, defaults, and FK/soft-ref decided
   deliberately.
7. **Indexes** on reference columns and common filters.
8. **Naming** consistent with the rest of the schema.
9. **Denormalization**, if any, is justified, measured, and has a consistency mechanism.
