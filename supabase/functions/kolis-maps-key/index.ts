// kolis-maps-key: serves the public Google Maps browser key to the frontend at runtime.
// The key is a CLIENT key (meant to ship in the browser) — protect it with HTTP-referrer
// restrictions in Google Cloud, NOT by secrecy. Kept out of the repo/build on purpose.
const KEY = Deno.env.get("GOOGLE_MAPS_KEY") ?? "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return new Response(JSON.stringify({ key: KEY }), {
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  });
});
