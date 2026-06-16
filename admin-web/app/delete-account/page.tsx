// Public account / data deletion page for the Kolis apps. Required by Google Play
// (a deletion method reachable without the app). Linked from Data safety + listing.
export const metadata = {
  title: "Kolis — Delete your account",
  description: "How to delete your Kolis account and associated data.",
};

export default function DeleteAccount() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 22px 80px", fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif", color: "#1a1722", lineHeight: 1.6 }}>
      <h1 style={{ color: "#E11D6B" }}>Delete your Kolis account</h1>
      <p>Kolis is operated by <b>Concord Express Inc.</b> You can delete your account and personal data at any time, either in the app or by request.</p>

      <h2>Option 1 — In the app (instant)</h2>
      <ol>
        <li>Open the <b>Kolis</b> app and sign in.</li>
        <li>Go to <b>Profile</b>.</li>
        <li>Tap <b>Delete account</b> and confirm.</li>
      </ol>
      <p>Your account is removed immediately.</p>

      <h2>Option 2 — Request by email (no app needed)</h2>
      <p>Email <a href="mailto:privacy@kolis.ca?subject=Delete%20my%20Kolis%20account" style={{ color: "#E11D6B" }}>privacy@kolis.ca</a> from the email on your account, or include the <b>phone number / email</b> you signed up with. We verify your identity and delete the account within <b>30 days</b>.</p>

      <h2>What gets deleted</h2>
      <p>Your profile (name, email, phone), saved addresses, identity-verification status, push tokens, and account history are deleted or de-identified.</p>

      <h2>What we may keep</h2>
      <p>We may retain limited records required by law — for example transaction and tax records, and fraud-prevention data — for the period required by applicable regulations, after which they are deleted. Payment and identity-verification data held by our processor (Stripe) is handled under Stripe&rsquo;s retention policies.</p>

      <p style={{ marginTop: 28, color: "#6B6675", fontSize: 13 }}>Questions? <a href="mailto:privacy@kolis.ca" style={{ color: "#E11D6B" }}>privacy@kolis.ca</a> · See our <a href="/privacy" style={{ color: "#E11D6B" }}>Privacy Policy</a>.</p>
    </main>
  );
}
