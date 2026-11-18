// How a stuck courier reaches dispatch (the last fallback before an admin override).
// DISPATCH_PHONE is intentionally empty until the real number is confirmed — never
// ship a placeholder. While empty, the app emails DISPATCH_EMAIL instead.
export const DISPATCH_PHONE = "";
export const DISPATCH_EMAIL = "support@concordexpress.ca";
