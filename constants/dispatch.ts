// How a stuck courier reaches dispatch (the last fallback before an admin override).
// DISPATCH_PHONE is the confirmed dispatch line. If it is ever cleared, the app
// falls back to emailing DISPATCH_EMAIL — never ship a placeholder number.
export const DISPATCH_PHONE = "+16138622639";   // 613-862-2639, confirmed 2026-11-18
export const DISPATCH_EMAIL = "support@concordexpress.ca";
