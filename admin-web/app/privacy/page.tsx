// Public privacy policy for the Kolis apps + portals. Linked from Google Play /
// App Store listings. Plain, no auth. Review with counsel before launch.
export const metadata = {
  title: "Kolis — Privacy Policy",
  description: "How Kolis (Concord Express) collects, uses, and protects your data.",
};

const UPDATED = "June 15, 2026";

export default function Privacy() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 22px 80px", fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif", color: "#1a1722", lineHeight: 1.6 }}>
      <h1 style={{ color: "#E11D6B" }}>Kolis Privacy Policy</h1>
      <p style={{ color: "#6B6675" }}>Last updated: {UPDATED}</p>

      <p>Kolis is a parcel-delivery service operated by <b>Concord Express Inc.</b> (&ldquo;Kolis&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy explains what we collect, how we use it, and your choices. It covers the Kolis mobile app and our web portals (business.kolis.ca, admin.kolis.ca).</p>

      <h2>Information we collect</h2>
      <ul>
        <li><b>Account:</b> name, email address, phone number, role (sender/courier), and language preference.</li>
        <li><b>Identity verification:</b> to verify couriers and members we use <b>Stripe Identity</b>, which collects a government-issued ID and a selfie. We receive a verified name and verification status; the ID images are processed by Stripe, not stored by us.</li>
        <li><b>Payments:</b> processed by <b>Stripe</b>. We do not store full card numbers; we receive payment status and limited card metadata.</li>
        <li><b>Delivery data:</b> pickup and drop-off addresses, parcel details, and delivery status. Couriers carrying your parcel see the information needed to complete the delivery.</li>
        <li><b>Location:</b> addresses you enter, and—where you grant permission—device location used to match and route deliveries.</li>
        <li><b>Device &amp; notifications:</b> a push-notification token and basic device information so we can send delivery alerts.</li>
        <li><b>Usage:</b> app activity and diagnostics used to operate and improve the service.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>Create and manage your account and verify your identity.</li>
        <li>Match parcels with couriers, route deliveries, and show tracking.</li>
        <li>Process the verification fee and any delivery charges.</li>
        <li>Send delivery requests and status notifications.</li>
        <li>Provide support, prevent fraud and abuse, and meet legal obligations.</li>
      </ul>

      <h2>How we share it</h2>
      <p>We share data only as needed to run the service: with <b>couriers and queue drivers</b> (delivery details for the parcel they carry), and with service providers who act on our behalf—<b>Stripe</b> (identity &amp; payments), <b>Supabase</b> (hosting/database), <b>Google Maps</b> (mapping/geocoding), and our push-notification and email providers. We do <b>not</b> sell your personal information. We may disclose information when required by law.</p>

      <h2>Data retention</h2>
      <p>We keep your information for as long as your account is active and as needed to provide the service or comply with legal, tax, and fraud-prevention requirements. You can delete your account in the app (Profile → Delete account), after which we remove or de-identify your personal data except where retention is legally required.</p>

      <h2>Security</h2>
      <p>We use encryption in transit, access controls, and reputable processors (Stripe, Supabase). No method of transmission or storage is completely secure, but we work to protect your information.</p>

      <h2>Your choices &amp; rights</h2>
      <ul>
        <li><b>Access &amp; deletion:</b> view your profile in the app and delete your account at any time.</li>
        <li><b>Notifications:</b> turn off push notifications in your device settings.</li>
        <li><b>Location:</b> grant or revoke location permission in your device settings.</li>
        <li>Depending on your region, you may have rights to access, correct, or delete your data—contact us to exercise them.</li>
      </ul>

      <h2>Children</h2>
      <p>Kolis is intended for users <b>18 and older</b>. We do not knowingly collect data from children.</p>

      <h2>Changes</h2>
      <p>We may update this policy and will revise the date above. Material changes will be communicated in the app or by email.</p>

      <h2>Contact</h2>
      <p>Concord Express Inc. — <a href="mailto:privacy@kolis.ca" style={{ color: "#E11D6B" }}>privacy@kolis.ca</a> · <a href="https://www.concordexpress.ca" style={{ color: "#E11D6B" }}>www.concordexpress.ca</a></p>
    </main>
  );
}
