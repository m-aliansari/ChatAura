// Deterministic avatar color for a user. The same user_id always yields the same palette, on every
// device and every render, without storing anything — so two people looking at the same conversation
// see the same avatar. Returns a Chakra `colorPalette` name (not a raw hex) so the avatar stays
// theme-aware: the palette's `subtle`/`fg` tokens resolve correctly in both light and dark mode.
const PALETTES = ["red", "orange", "green", "teal", "blue", "cyan", "purple", "pink"];

export const avatarColor = (userId) => {
    if (!userId) return PALETTES[0];

    // Small deterministic string hash (djb2-ish). `| 0` keeps it in int32 so the result cannot drift
    // into float territory for long ids.
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = (hash * 31 + userId.charCodeAt(i)) | 0;
    }

    return PALETTES[Math.abs(hash) % PALETTES.length];
};
