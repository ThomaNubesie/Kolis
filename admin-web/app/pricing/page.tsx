"use client";
import { useState } from "react";
import { useLang } from "@/lib/i18n";

// Quorly public pricing page (/pricing). Per-organization, CAD, 1-month free
// trial. Namespaced qp-* classes because this renders inside the shared app
// document (globals.css defines generic .tier/.btn/.row/.card that would leak).
// EN/FR via the app's shared language (useLang) + a `fr` class; monthly/annual
// via an `annual` class. Numbers here mirror the enforced gates in the org model.

function Dots() {
  return (
    <div className="qp-dots">
      <i style={{ background: "var(--d1)" }} /><i style={{ background: "var(--d2)" }} />
      <i style={{ background: "var(--d3)" }} /><i style={{ background: "var(--d4)" }} />
    </div>
  );
}

export default function Pricing() {
  const { lang, setLang } = useLang();
  const fr = lang === "fr";
  const [annual, setAnnual] = useState(false);
  const cls = ["qp", fr ? "fr" : "", annual ? "annual" : ""].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <style>{CSS}</style>

      <header className="qp-top">
        <div className="qp-wrap qp-in">
          <a className="qp-logo" href="/">
            <div className="qp-row"><span className="qp-q">Q</span><span className="qp-w">Quorly</span></div>
            <Dots />
          </a>
          <div className="qp-nav"><a href="/"><span data-en>For boards</span><span data-fr>Conseils</span></a><a className="on"><span data-en>Pricing</span><span data-fr>Tarifs</span></a></div>
          <div className="qp-right">
            <div className="qp-lang">
              <button className={fr ? "" : "on"} onClick={() => setLang("en")}>EN</button>
              <button className={fr ? "on" : ""} onClick={() => setLang("fr")}>FR</button>
            </div>
            <a className="qp-btn qp-btn-p" href="/forms"><span data-en>Start free</span><span data-fr>Commencer</span></a>
          </div>
        </div>
      </header>

      <section className="qp-hero"><div className="qp-wrap">
        <h1><span data-en>Simple pricing, per organization</span><span data-fr>Tarifs simples, par organisation</span></h1>
        <p><span data-en>One flat price for your whole group — invite every member, no per-seat surprises. Start free for 1 month.</span><span data-fr>Un prix fixe pour tout votre groupe — invitez tous les membres, sans frais par siège. Gratuit 1 mois.</span></p>
        <p className="qp-cad"><span data-en>All prices in Canadian dollars (CAD).</span><span data-fr>Tous les prix en dollars canadiens (CAD).</span></p>
        <div className="qp-toggle">
          <button className={annual ? "" : "on"} onClick={() => setAnnual(false)}><span data-en>Monthly</span><span data-fr>Mensuel</span></button>
          <button className={annual ? "on" : ""} onClick={() => setAnnual(true)}><span data-en>Annual</span><span data-fr>Annuel</span> <span className="qp-save"><span data-en>2 months free</span><span data-fr>2 mois gratuits</span></span></button>
        </div>
      </div></section>

      <div className="qp-wrap">
        <div className="qp-tiers">
          {/* FREE */}
          <div className="qp-tier">
            <div className="qp-nm">Free</div>
            <div className="qp-pr">$0</div>
            <div className="qp-per"><span data-en>forever</span><span data-fr>pour toujours</span></div>
            <div className="qp-u"><span data-en>A small committee getting started</span><span data-fr>Un petit comité qui démarre</span></div>
            <ul>
              <li><span className="qp-c">✓</span> <span><b><span data-en>1 board</span><span data-fr>1 conseil</span></b> · <span data-en>up to 10 members</span><span data-fr>jusqu’à 10 membres</span></span></li>
              <li><span className="qp-c">✓</span> <span><span data-en>Minutes, motions &amp; votes</span><span data-fr>PV, motions &amp; votes</span></span></li>
              <li><span className="qp-c">✓</span> <span><span data-en>Documents &amp; folders</span><span data-fr>Documents &amp; dossiers</span> · 2 GB</span></li>
            </ul>
            <a className="qp-btn qp-btn-g" href="/forms"><span data-en>Start free</span><span data-fr>Commencer</span></a>
          </div>
          {/* BOARD */}
          <div className="qp-tier qp-pop">
            <span className="qp-flag"><span data-en>Most boards</span><span data-fr>Populaire</span></span>
            <div className="qp-nm">Board</div>
            <div className="qp-pr qp-m">$79<small> CAD/<span data-en>mo</span><span data-fr>mois</span></small></div>
            <div className="qp-pr qp-a">$790<small> CAD/<span data-en>yr</span><span data-fr>an</span></small></div>
            <div className="qp-per qp-m"><span data-en>per organization, billed monthly</span><span data-fr>par organisation, mensuel</span></div>
            <div className="qp-per qp-a"><span data-en>= $65.83/mo · 2 months free</span><span data-fr>= 65,83 $/mois · 2 mois gratuits</span></div>
            <div className="qp-u"><span data-en>Everything a working board needs</span><span data-fr>Tout pour un conseil actif</span></div>
            <ul>
              <li><span className="qp-c">✓</span> <span><b><span data-en>Up to 100 members</span><span data-fr>Jusqu’à 100 membres</span></b> · <span data-en>up to 3 departments</span><span data-fr>jusqu’à 3 départements</span></span></li>
              <li><span className="qp-c">✓</span> <span><b><span data-en>Elections</span><span data-fr>Élections</span></b> &amp; <span data-en>committees</span><span data-fr>comités</span></span></li>
              <li><span className="qp-c">✓</span> <span><b><span data-en>Receipts</span><span data-fr>Reçus</span></b> → <span data-en>expense reports</span><span data-fr>rapports de dépenses</span></span></li>
              <li><span className="qp-c">✓</span> <span>2FA + <span data-en>download approval</span><span data-fr>approbation téléchargement</span></span></li>
              <li><span className="qp-c">✓</span> <span>50 GB <span data-en>storage</span><span data-fr>de stockage</span></span></li>
            </ul>
            <a className="qp-btn qp-btn-p" href="/forms"><span data-en>Start free trial</span><span data-fr>Essai gratuit</span></a>
          </div>
          {/* BUSINESS */}
          <div className="qp-tier">
            <div className="qp-nm">Business</div>
            <div className="qp-pr qp-m">$129<small> CAD/<span data-en>mo</span><span data-fr>mois</span></small></div>
            <div className="qp-pr qp-a">$1,290<small> CAD/<span data-en>yr</span><span data-fr>an</span></small></div>
            <div className="qp-per qp-m"><span data-en>per organization, billed monthly</span><span data-fr>par organisation, mensuel</span></div>
            <div className="qp-per qp-a"><span data-en>= $107.50/mo · 2 months free</span><span data-fr>= 107,50 $/mois · 2 mois gratuits</span></div>
            <div className="qp-u"><span data-en>Associations with staff &amp; several boards</span><span data-fr>Associations avec personnel</span></div>
            <ul>
              <li><span className="qp-c">✓</span> <span><span data-en>Everything in Board</span><span data-fr>Tout de Board</span></span></li>
              <li><span className="qp-c">✓</span> <span><b><span data-en>Unlimited members &amp; departments</span><span data-fr>Membres &amp; départements illimités</span></b></span></li>
              <li><span className="qp-c">✓</span> <span><b><span data-en>End-to-end encryption</span><span data-fr>Chiffrement bout en bout</span></b></span></li>
              <li><span className="qp-c">✓</span> <span><span data-en>Priority support</span><span data-fr>Soutien prioritaire</span></span></li>
              <li><span className="qp-c">✓</span> <span>500 GB <span data-en>storage</span><span data-fr>de stockage</span></span></li>
            </ul>
            <a className="qp-btn qp-btn-g" href="/forms"><span data-en>Start free</span><span data-fr>Commencer</span></a>
          </div>
          {/* ENTERPRISE */}
          <div className="qp-tier">
            <div className="qp-nm">Enterprise</div>
            <div className="qp-pr"><span data-en>Custom</span><span data-fr>Sur mesure</span></div>
            <div className="qp-per"><span data-en>let’s talk</span><span data-fr>parlons-en</span></div>
            <div className="qp-u"><span data-en>Federations, unions &amp; large nonprofits</span><span data-fr>Fédérations, syndicats, grands OBNL</span></div>
            <ul>
              <li><span className="qp-c">✓</span> <span><span data-en>Unlimited boards &amp; storage</span><span data-fr>Conseils &amp; stockage illimités</span></span></li>
              <li><span className="qp-c">✓</span> <span>SSO &amp; <span data-en>custom retention</span><span data-fr>rétention sur mesure</span></span></li>
              <li><span className="qp-c">✓</span> <span><span data-en>Dedicated onboarding &amp; DPA</span><span data-fr>Intégration dédiée &amp; DPA</span></span></li>
            </ul>
            <a className="qp-btn qp-btn-g" href="mailto:hello@quorly.ca"><span data-en>Contact us</span><span data-fr>Nous joindre</span></a>
          </div>
        </div>

        {/* COMPARISON */}
        <div className="qp-cmp">
          <h3><span data-en>Compare plans</span><span data-fr>Comparer les forfaits</span></h3>
          <div className="qp-tablewrap"><table>
            <thead><tr>
              <th><span data-en>Feature</span><span data-fr>Fonction</span></th>
              <th>Free</th><th className="qp-pop">Board</th><th>Business</th><th>Enterprise</th>
            </tr></thead>
            <tbody>
              <tr><td><span data-en>Members</span><span data-fr>Membres</span></td><td>10</td><td>100</td><td className="qp-c"><span data-en>Unlimited</span><span data-fr>Illimité</span></td><td className="qp-c"><span data-en>Unlimited</span><span data-fr>Illimité</span></td></tr>
              <tr><td><span data-en>Departments</span><span data-fr>Départements</span></td><td>1</td><td>3</td><td className="qp-c"><span data-en>Unlimited</span><span data-fr>Illimité</span></td><td className="qp-c"><span data-en>Unlimited</span><span data-fr>Illimité</span></td></tr>
              <tr><td><span data-en>Minutes, motions &amp; votes</span><span data-fr>PV, motions &amp; votes</span></td><td className="qp-c">✓</td><td className="qp-c">✓</td><td className="qp-c">✓</td><td className="qp-c">✓</td></tr>
              <tr><td><span data-en>Documents, folders &amp; versions</span><span data-fr>Documents, dossiers &amp; versions</span></td><td className="qp-c">✓</td><td className="qp-c">✓</td><td className="qp-c">✓</td><td className="qp-c">✓</td></tr>
              <tr><td><span data-en>Storage</span><span data-fr>Stockage</span></td><td>2 GB</td><td>50 GB</td><td>500 GB</td><td><span data-en>Custom</span><span data-fr>Sur mesure</span></td></tr>
              <tr><td><span data-en>Elections</span><span data-fr>Élections</span></td><td className="qp-x">—</td><td className="qp-c">✓</td><td className="qp-c">✓</td><td className="qp-c">✓</td></tr>
              <tr><td><span data-en>Receipts &amp; expense reports</span><span data-fr>Reçus &amp; rapports de dépenses</span></td><td className="qp-x">—</td><td className="qp-c">✓</td><td className="qp-c">✓</td><td className="qp-c">✓</td></tr>
              <tr><td>2FA + <span data-en>download approval</span><span data-fr>approbation téléchargement</span></td><td className="qp-x">—</td><td className="qp-c">✓</td><td className="qp-c">✓</td><td className="qp-c">✓</td></tr>
              <tr><td><span data-en>End-to-end encryption</span><span data-fr>Chiffrement bout en bout</span></td><td className="qp-x">—</td><td className="qp-x">—</td><td className="qp-c">✓</td><td className="qp-c">✓</td></tr>
              <tr><td>SSO &amp; <span data-en>custom retention</span><span data-fr>rétention sur mesure</span></td><td className="qp-x">—</td><td className="qp-x">—</td><td className="qp-x">—</td><td className="qp-c">✓</td></tr>
              <tr><td><span data-en>Support</span><span data-fr>Soutien</span></td><td><span data-en>Community</span><span data-fr>Communauté</span></td><td><span data-en>Email</span><span data-fr>Courriel</span></td><td><span data-en>Priority</span><span data-fr>Prioritaire</span></td><td><span data-en>Dedicated</span><span data-fr>Dédié</span></td></tr>
            </tbody>
          </table></div>
        </div>

        <div className="qp-notes">
          <div className="qp-note">💛 <b><span data-en>Nonprofit discount</span><span data-fr>Rabais OBNL</span></b> — <span data-en>registered nonprofits get 30–50% off any paid plan. Just ask.</span><span data-fr>les OBNL enregistrés obtiennent 30 à 50 % de rabais sur tout forfait payant. Demandez-nous.</span></div>
          <div className="qp-note">🎁 <b><span data-en>1 month free</span><span data-fr>1 mois gratuit</span></b> — <span data-en>run your board on the Board plan free for 1 month. No credit card, 20-minute setup.</span><span data-fr>utilisez le forfait Board gratuitement 1 mois. Sans carte, configuration en 20 min.</span></div>
        </div>

        {/* FAQ */}
        <div className="qp-faq">
          <h3>FAQ</h3>
          <div className="qp-qa"><div className="qp-q"><span data-en>Is it really per organization, not per member?</span><span data-fr>Est-ce vraiment par organisation, pas par membre ?</span></div><div className="qp-ans"><span data-en>Yes. Invite your whole board or association — 10 members or 100 — for one flat price. Volunteers should never be a line item.</span><span data-fr>Oui. Invitez tout votre conseil ou association — 10 ou 100 membres — pour un prix fixe. Les bénévoles ne devraient jamais être facturés à l’unité.</span></div></div>
          <div className="qp-qa"><div className="qp-q"><span data-en>What happens after the 1-month free trial?</span><span data-fr>Que se passe-t-il après l’essai gratuit d’un mois ?</span></div><div className="qp-ans"><span data-en>You choose a plan or drop to Free. Nothing is deleted — your minutes and documents stay put.</span><span data-fr>Vous choisissez un forfait ou revenez à Gratuit. Rien n’est supprimé — vos PV et documents restent en place.</span></div></div>
          <div className="qp-qa"><div className="qp-q"><span data-en>Where is our data stored?</span><span data-fr>Où sont stockées nos données ?</span></div><div className="qp-ans"><span data-en>In Canada 🇨🇦, encrypted at rest, with 2FA and end-to-end encryption available on paid plans.</span><span data-fr>Au Canada 🇨🇦, chiffrées au repos, avec 2FA et chiffrement bout en bout sur les forfaits payants.</span></div></div>
        </div>

        <div className="qp-final">
          <h2><span data-en>Run your next meeting on Quorly.</span><span data-fr>Tenez votre prochaine réunion sur Quorly.</span></h2>
          <p><span data-en>Free for 1 month · 20-minute setup · no credit card.</span><span data-fr>Gratuit 1 mois · configuration en 20 min · sans carte.</span></p>
          <a className="qp-btn qp-fcta" href="/forms"><span data-en>Start a free board →</span><span data-fr>Créer un conseil gratuit →</span></a>
        </div>
      </div>
      <div style={{ height: 44 }} />
    </div>
  );
}

const CSS = `
.qp{--indigo:#2F3AA3;--indigo-d:#232B7A;--ink:#1C1B19;--muted:#5A6472;--line:#EAE4DA;--cream:#FBF8F2;--cream2:#F4EEE3;--d1:#E8613A;--d2:#F2B01E;--d3:#2FA36B;--d4:#2F3AA3;
  color-scheme:light;background:var(--cream);color:var(--ink);min-height:100vh;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Arial,sans-serif;line-height:1.5;overflow-x:hidden}
.qp *{box-sizing:border-box}
.qp a{text-decoration:none;color:inherit}
.qp h1,.qp h2,.qp h3,.qp h4{margin:0;letter-spacing:-.02em;font-weight:800;line-height:1.1;color:var(--ink)}
.qp p{margin:0}
.qp .qp-wrap{max-width:1080px;margin:0 auto;padding:0 22px}
.qp .qp-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;font-weight:800;font-size:14px;padding:12px 18px;border-radius:11px;border:2px solid transparent;cursor:pointer}
.qp .qp-btn-p{background:var(--indigo);color:#fff;border-color:var(--indigo)}.qp .qp-btn-p:hover{background:var(--indigo-d)}
.qp .qp-btn-g{background:#fff;color:var(--ink);border-color:var(--line)}.qp .qp-btn-g:hover{background:var(--cream)}
.qp .qp-dots{display:flex;gap:5px;padding-left:34px;margin-top:5px}.qp .qp-dots i{width:7px;height:7px;border-radius:50%;display:block}
.qp .qp-logo{display:inline-flex;flex-direction:column;align-items:flex-start}
.qp .qp-row{display:flex;align-items:baseline;gap:8px}.qp .qp-q{font-weight:900;font-size:26px;color:var(--indigo)}.qp .qp-w{font-weight:800;font-size:16px;color:var(--ink)}
.qp .qp-top{position:sticky;top:0;z-index:40;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.qp .qp-in{display:flex;align-items:center;gap:16px;height:66px}
.qp .qp-nav{display:flex;gap:22px;margin-left:12px;font-weight:600;font-size:14px}.qp .qp-nav a{color:#333}.qp .qp-nav a.on{color:var(--indigo)}
.qp .qp-right{margin-left:auto;display:flex;align-items:center;gap:12px}
.qp .qp-lang{display:flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}
.qp .qp-lang button{border:0;background:#fff;padding:6px 10px;font-weight:700;font-size:12px;color:var(--muted);cursor:pointer}.qp .qp-lang button.on{background:var(--indigo);color:#fff}
@media(max-width:720px){.qp .qp-nav{display:none}}
.qp .qp-hero{text-align:center;padding:52px 0 8px}
.qp .qp-hero h1{font-size:40px}
.qp .qp-hero p{color:#3A3A37;font-size:17px;margin-top:12px}
.qp .qp-cad{font-size:12.5px;color:var(--muted);margin-top:8px}
@media(max-width:600px){.qp .qp-hero h1{font-size:30px}}
.qp .qp-toggle{display:inline-flex;align-items:center;gap:10px;margin-top:22px;background:#fff;border:1px solid var(--line);border-radius:999px;padding:5px}
.qp .qp-toggle button{border:0;background:none;padding:9px 16px;border-radius:999px;font-weight:800;font-size:13px;color:var(--muted);cursor:pointer}.qp .qp-toggle button.on{background:var(--indigo);color:#fff}
.qp .qp-save{font-size:11.5px;font-weight:800;color:#1E7A48;background:#E4F6EC;border-radius:999px;padding:3px 9px;margin-left:2px}
.qp .qp-tiers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:34px}
@media(max-width:900px){.qp .qp-tiers{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.qp .qp-tiers{grid-template-columns:1fr}}
.qp .qp-tier{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px 20px;display:flex;flex-direction:column}
.qp .qp-pop{border:2px solid var(--indigo);box-shadow:0 24px 50px -28px rgba(35,43,122,.5);position:relative}
.qp .qp-flag{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--indigo);color:#fff;font-weight:800;font-size:11px;letter-spacing:.05em;text-transform:uppercase;padding:5px 12px;border-radius:999px;white-space:nowrap}
.qp .qp-nm{font-weight:800;font-size:17px}
.qp .qp-pr{font-size:36px;font-weight:900;margin:10px 0 0;letter-spacing:-.02em;color:var(--ink)}
.qp .qp-pr small{font-size:14px;font-weight:700;color:var(--muted)}
.qp .qp-per{font-size:12.5px;color:var(--muted);min-height:32px;margin-top:4px}
.qp .qp-u{font-size:13px;color:var(--muted);min-height:36px;margin-top:8px}
.qp .qp-tier ul{list-style:none;padding:0;margin:16px 0 20px}
.qp .qp-tier li{font-size:13px;padding:7px 0;border-top:1px solid var(--line);display:flex;gap:8px;align-items:flex-start;color:var(--ink)}
.qp .qp-tier li b{font-weight:800}
.qp .qp-tier .qp-btn{width:100%;margin-top:auto}
.qp .qp-c{color:#1E7A48;font-weight:900}
.qp .qp-cmp{margin-top:56px;background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden}
.qp .qp-cmp h3{padding:18px 20px;font-size:18px;border-bottom:1px solid var(--line)}
.qp .qp-tablewrap{overflow-x:auto}
.qp table{width:100%;border-collapse:collapse;font-size:13.5px;min-width:560px}
.qp th,.qp td{text-align:center;padding:11px 10px;border-bottom:1px solid var(--line)}
.qp th:first-child,.qp td:first-child{text-align:left;color:#3A3A37;font-weight:600}
.qp thead th{background:var(--cream);font-size:12.5px;color:var(--ink)}
.qp thead th.qp-pop{color:var(--indigo);border:0;box-shadow:none;position:static}
.qp td.qp-c{color:#1E7A48}.qp td.qp-x{color:#C7C1B6}
.qp tbody tr:last-child td{border-bottom:0}
.qp .qp-notes{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:26px}
@media(max-width:700px){.qp .qp-notes{grid-template-columns:1fr}}
.qp .qp-note{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;font-size:13.5px;color:#3A3A37}.qp .qp-note b{color:var(--indigo)}
.qp .qp-faq{margin-top:48px}
.qp .qp-faq h3{font-size:22px;text-align:center;margin-bottom:18px}
.qp .qp-qa{background:#fff;border:1px solid var(--line);border-radius:12px;padding:15px 17px;margin-bottom:10px}
.qp .qp-q{font-weight:800;font-size:14.5px}
.qp .qp-ans{font-size:13.5px;color:#3A3A37;margin-top:6px}
.qp .qp-final{margin-top:56px;background:linear-gradient(135deg,var(--indigo),var(--indigo-d));color:#fff;border-radius:20px;padding:40px 24px;text-align:center}
.qp .qp-final h2{font-size:28px;color:#fff}.qp .qp-final p{color:#D2D6F0;margin-top:10px}
.qp .qp-fcta{margin-top:20px;background:#fff;color:var(--indigo);border-color:#fff}.qp .qp-fcta:hover{background:var(--cream)}
.qp [data-fr]{display:none}
.qp.fr [data-en]{display:none}.qp.fr [data-fr]{display:revert}
.qp .qp-a{display:none}
.qp.annual .qp-m{display:none}.qp.annual .qp-a{display:revert}
`;
