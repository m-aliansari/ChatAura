// Merge incoming messages into the existing flat array, deduping by `messageId` and keeping
// the array newest-first (descending `id`). Used by both the initial/live MESSAGES path and
// the paginated LOAD_OLDER / LOAD_MORE_FRIENDS paths: live/initial messages carry higher ids
// (float to the front) and older pages carry lower ids (sink to the back), so a single stable
// sort by id-desc handles every case. Items missing an `id` (e.g. a transient optimistic
// entry) sort to the front so they stay visible until reconciled.
export const mergeMessages = (prev, incoming) => {
    if (!incoming?.length) return prev;

    const byId = new Map();
    for (const m of prev) byId.set(m.messageId, m);
    for (const m of incoming) if (!byId.has(m.messageId)) byId.set(m.messageId, m);

    const rank = (m) => m.id ?? Number.MAX_SAFE_INTEGER;
    return [...byId.values()].sort((a, b) => rank(b) - rank(a));
};
