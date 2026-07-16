// WhatsApp-style relative timestamp for a conversation row:
//   today       -> a clock time ("3:05 PM")
//   yesterday   -> "Yesterday"
//   this week   -> weekday ("Mon")
//   older       -> short date ("Mar 4")
// Returns "" for a missing/invalid input so the row simply renders no time.
export const formatConversationTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";

    const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);

    if (days <= 0) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (days === 1) return "Yesterday";
    if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
};
