/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // /forms became /organizations. The old path MUST keep working: links to it are
  // already sitting in people's inboxes — meeting invitations, appointment letters,
  // the invite that 46 drivers were nudged with — and in .ics entries on their
  // calendars, none of which can be edited after the fact. A 308 is permanent and
  // preserves the method, and :splat carries /forms/new and /forms/new-org across.
  //
  // Query strings survive automatically, which matters for /forms?open=<id> — the
  // deep link download-approval emails use.
  async redirects() {
    return [
      { source: "/forms", destination: "/organizations", permanent: true },
      { source: "/forms/:splat*", destination: "/organizations/:splat*", permanent: true },
    ];
  },
};
export default nextConfig;
