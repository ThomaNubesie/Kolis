"use client";
import { useEffect, useState } from "react";

// Quorly-for-boards marketing homepage. Rendered at "/" ONLY on the Quorly
// domain (app/page.tsx branches on the Host header, SSR). Dropbox-style: clean
// hero + product shot, three alternating feature rows, security band, per-board
// pricing, fat footer. Bilingual EN/FR via a `fr` class on the .qb wrapper.
//
// IMPORTANT: every class is namespaced `qb-*` because this page renders inside
// the shared Kolis app document (globals.css defines generic .nav/.card/.who/
// .btn/.row/.pill etc. that would otherwise leak in and break the layout —
// notably globals' `.who{position:absolute}`). Do NOT introduce un-prefixed
// generic class names here.

function Check() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2FA36B" strokeWidth={2.4}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
function Dots() {
  return (
    <div className="qb-dots">
      <i style={{ background: "var(--d1)" }} />
      <i style={{ background: "var(--d2)" }} />
      <i style={{ background: "var(--d3)" }} />
      <i style={{ background: "var(--d4)" }} />
    </div>
  );
}

export default function BoardsHome() {
  const [fr, setFr] = useState(false);
  useEffect(() => {
    document.title = "Quorly — for boards & associations";
  }, []);
  return (
    <div className={"qb" + (fr ? " fr" : "")}>
      <style>{CSS}</style>

      {/* NAV */}
      <header className="qb-hdr">
        <div className="qb-wrap qb-nav">
          <div className="qb-logo" aria-label="Quorly">
            <div className="qb-row"><span className="qb-q">Q</span><span className="qb-word">Quorly</span></div>
            <Dots />
          </div>
          <nav className="qb-links">
            <a href="#feat"><span data-en>Features</span><span data-fr>Fonctions</span></a>
            <a href="#security"><span data-en>Security</span><span data-fr>Sécurité</span></a>
            <a href="#pricing"><span data-en>Pricing</span><span data-fr>Tarifs</span></a>
          </nav>
          <div className="qb-right">
            <div className="qb-lang">
              <button className={fr ? "" : "on"} onClick={() => setFr(false)}>EN</button>
              <button className={fr ? "on" : ""} onClick={() => setFr(true)}>FR</button>
            </div>
            <a className="qb-btn qb-btn-primary" href="/forms"><span data-en>Start free</span><span data-fr>Commencer</span></a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="qb-hero">
        <div className="qb-wrap qb-grid">
          <div>
            <span className="qb-eyebrow"><span data-en>Built for boards &amp; associations</span><span data-fr>Pour conseils &amp; associations</span></span>
            <h1 className="qb-h1">
              <span data-en>Everything your board needs<br />between meetings.</span>
              <span data-fr>Tout ce dont votre conseil<br />a besoin entre les réunions.</span>
            </h1>
            <p className="qb-sub">
              <span data-en>Minutes, votes, secure documents and the treasurer&rsquo;s receipts — in one place every member trusts. No more email threads, shared drives and lost spreadsheets.</span>
              <span data-fr>Procès-verbaux, votes, documents sécurisés et reçus du trésorier — au même endroit, en qui chaque membre a confiance. Fini les fils de courriels et les tableurs perdus.</span>
            </p>
            <div className="qb-cta">
              <a className="qb-btn qb-btn-primary qb-btn-lg" href="/forms"><span data-en>Start a free board</span><span data-fr>Créer un conseil gratuit</span> →</a>
              <a className="qb-btn qb-btn-ghost qb-btn-lg" href="#feat"><span data-en>See how it works</span><span data-fr>Voir comment</span></a>
            </div>
            <p className="qb-micro"><span data-en>Free 3-month pilot · 20-minute setup · No credit card</span><span data-fr>Essai gratuit de 3 mois · Configuration en 20 min · Sans carte</span></p>
          </div>

          <div className="qb-shot" aria-hidden="true">
            <div className="qb-bar"><i /><i /><i /><b>Concord Community Board · <span data-en>July meeting</span><span data-fr>Réunion de juillet</span></b></div>
            <div className="qb-shotbody">
              <div className="qb-card">
                <div className="qb-t"><span><span data-en>Motion: Approve 2026 budget</span><span data-fr>Motion : Budget 2026</span></span> <span className="qb-pill qb-pass"><span data-en>Passed 5–1</span><span data-fr>Adopté 5–1</span></span></div>
                <div className="qb-m"><span data-en>Decision recorded · minutes updated automatically</span><span data-fr>Décision enregistrée · procès-verbal mis à jour</span></div>
              </div>
              <div className="qb-card">
                <div className="qb-t"><span><span data-en>Motion: New signing officer</span><span data-fr>Motion : Signataire</span></span> <span className="qb-pill qb-vote"><span data-en>Voting</span><span data-fr>Vote en cours</span></span></div>
                <div className="qb-vrow"><span className="qb-y"><span data-en>For 4</span><span data-fr>Pour 4</span></span><span className="qb-n"><span data-en>Against 1</span><span data-fr>Contre 1</span></span><span className="qb-abs"><span data-en>Abstain 1</span><span data-fr>Abst. 1</span></span></div>
              </div>
              <div className="qb-card">
                <div className="qb-t"><span><span data-en>Bylaws 2026 · v3</span><span data-fr>Règlements 2026 · v3</span></span> <span className="qb-pill qb-lock">🔒 2FA</span></div>
                <div className="qb-m"><span data-en>End-to-end encrypted · board members only</span><span data-fr>Chiffré de bout en bout · membres seulement</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <div className="qb-proof">
        <div className="qb-wrap">
          <p><span data-en>Made for the groups that keep communities running</span><span data-fr>Pour les groupes qui font tourner les communautés</span></p>
          <div className="qb-prow">
            <span><span data-en>Nonprofits</span><span data-fr>OBNL</span></span>
            <span><span data-en>Condo boards</span><span data-fr>Syndicats de copro</span></span>
            <span><span data-en>Co-ops</span><span data-fr>Coopératives</span></span>
            <span><span data-en>Church councils</span><span data-fr>Conseils paroissiaux</span></span>
            <span><span data-en>Sports clubs</span><span data-fr>Clubs sportifs</span></span>
            <span><span data-en>School PACs</span><span data-fr>Comités d&rsquo;école</span></span>
          </div>
        </div>
      </div>

      {/* FEATURE 1 — Minutes (Secretary) */}
      <section className="qb-feat" id="feat">
        <div className="qb-wrap qb-grid">
          <div>
            <div className="qb-tag" style={{ color: "var(--d4)" }}><span data-en>Minutes &amp; decisions</span><span data-fr>Procès-verbaux &amp; décisions</span></div>
            <h2 className="qb-h2"><span data-en>Every motion, vote and decision — on the record.</span><span data-fr>Chaque motion, vote et décision — au dossier.</span></h2>
            <p className="qb-lead"><span data-en>Members comment, vote and reach a decision right on the item. Quorly writes the outcome into the minutes so nothing gets &ldquo;he-said-she-said.&rdquo;</span><span data-fr>Les membres commentent, votent et décident directement sur le point. Quorly inscrit le résultat au procès-verbal — sans ambiguïté.</span></p>
            <ul className="qb-ul">
              <li><Check /><span><span data-en>Threaded comments &amp; recorded votes on each motion</span><span data-fr>Commentaires et votes enregistrés sur chaque motion</span></span></li>
              <li><Check /><span><span data-en>Approved / rejected badge on every decision</span><span data-fr>Badge adopté / rejeté sur chaque décision</span></span></li>
              <li><Check /><span><span data-en>Sub-forms for committees — finance, board, leadership</span><span data-fr>Sous-formulaires par comité — finances, conseil, direction</span></span></li>
            </ul>
            <div className="qb-who">👤 <span data-en>For the Secretary</span><span data-fr>Pour le/la secrétaire</span></div>
          </div>
          <div className="qb-mini">
            <h4 className="qb-mh"><span data-en>Motion · budget 2026</span><span data-fr>Motion · budget 2026</span></h4>
            <div className="qb-card"><div className="qb-t"><span><span data-en>Approve the 2026 operating budget</span><span data-fr>Adopter le budget 2026</span></span> <span className="qb-pill qb-pass"><span data-en>Passed</span><span data-fr>Adopté</span></span></div>
              <div className="qb-vrow"><span className="qb-y"><span data-en>For 5</span><span data-fr>Pour 5</span></span><span className="qb-n"><span data-en>Against 1</span><span data-fr>Contre 1</span></span><span className="qb-abs">—</span></div></div>
            <div className="qb-card"><div className="qb-m">💬 <b>Marie</b> — <span data-en>&ldquo;Motion to approve as circulated.&rdquo;</span><span data-fr>« Je propose l&rsquo;adoption telle que présentée. »</span></div></div>
            <div className="qb-card"><div className="qb-m">💬 <b>David</b> — <span data-en>&ldquo;Seconded.&rdquo;</span><span data-fr>« Appuyé. »</span></div></div>
          </div>
        </div>
      </section>

      {/* FEATURE 2 — Documents (whole board) */}
      <section className="qb-feat qb-alt qb-cream" id="docs">
        <div className="qb-wrap qb-grid">
          <div>
            <div className="qb-tag" style={{ color: "var(--d1)" }}><span data-en>Secure documents</span><span data-fr>Documents sécurisés</span></div>
            <h2 className="qb-h2"><span data-en>One secure home for every board document.</span><span data-fr>Un espace sûr pour tous vos documents.</span></h2>
            <p className="qb-lead"><span data-en>Bylaws, policies, contracts and past minutes — organized in colour-coded folders, versioned, and shareable with a single controlled link. Members see what&rsquo;s current; nothing lives in someone&rsquo;s inbox.</span><span data-fr>Règlements, politiques, contrats et anciens PV — dans des dossiers colorés, versionnés et partageables par un lien contrôlé. Rien ne dort dans une boîte de courriel.</span></p>
            <ul className="qb-ul">
              <li><Check /><span><span data-en>Folders, versions &amp; in-app preview (PDF, Word, Excel)</span><span data-fr>Dossiers, versions et aperçu intégré (PDF, Word, Excel)</span></span></li>
              <li><Check /><span><span data-en>Per-member access &amp; download approval</span><span data-fr>Accès par membre et approbation des téléchargements</span></span></li>
              <li><Check /><span><span data-en>Expiry reminders on insurance, permits &amp; terms</span><span data-fr>Rappels d&rsquo;échéance sur assurances, permis et mandats</span></span></li>
            </ul>
            <div className="qb-who">👥 <span data-en>For the whole board</span><span data-fr>Pour tout le conseil</span></div>
          </div>
          <div className="qb-mini">
            <h4 className="qb-mh"><span data-en>Board documents</span><span data-fr>Documents du conseil</span></h4>
            <div className="qb-filerow"><span className="qb-ic">📄</span><div><div className="qb-fn">Bylaws 2026 v3.pdf</div><div className="qb-fs"><span data-en>Updated 2 days ago · 2FA</span><span data-fr>Modifié il y a 2 jours · 2FA</span></div></div><span className="qb-star">🔴</span></div>
            <div className="qb-filerow"><span className="qb-ic">📄</span><div><div className="qb-fn"><span data-en>Insurance policy.pdf</span><span data-fr>Police d&rsquo;assurance.pdf</span></div><div className="qb-fs" style={{ color: "#B23C1E" }}><span data-en>Expires in 21 days</span><span data-fr>Expire dans 21 jours</span></div></div><span className="qb-star">🟡</span></div>
            <div className="qb-filerow"><span className="qb-ic">📝</span><div><div className="qb-fn"><span data-en>June minutes.docx</span><span data-fr>PV de juin.docx</span></div><div className="qb-fs"><span data-en>Approved · shared</span><span data-fr>Adopté · partagé</span></div></div><span className="qb-star">🟢</span></div>
          </div>
        </div>
      </section>

      {/* FEATURE 3 — Receipts (Treasurer) */}
      <section className="qb-feat" id="receipts">
        <div className="qb-wrap qb-grid">
          <div>
            <div className="qb-tag" style={{ color: "var(--d3)" }}><span data-en>Receipts &amp; expenses</span><span data-fr>Reçus &amp; dépenses</span></div>
            <h2 className="qb-h2"><span data-en>Snap a receipt. Quorly builds the expense report.</span><span data-fr>Photographiez un reçu. Quorly monte le rapport.</span></h2>
            <p className="qb-lead"><span data-en>The treasurer photographs a receipt; Quorly reads the merchant, date, tax and total, sorts it by category, and totals it up — ready to export as CSV or PDF at year-end.</span><span data-fr>Le trésorier photographie un reçu ; Quorly lit le commerçant, la date, la taxe et le total, le classe par catégorie et fait la somme — exportable en CSV ou PDF en fin d&rsquo;année.</span></p>
            <ul className="qb-ul">
              <li><Check /><span><span data-en>Auto-reads merchant, date, tax &amp; grand total</span><span data-fr>Lecture auto : commerçant, date, taxe et total</span></span></li>
              <li><Check /><span><span data-en>Photo kept &amp; sorted by category</span><span data-fr>Photo conservée et classée par catégorie</span></span></li>
              <li><Check /><span><span data-en>CSV / PDF export &amp; emailed expense summary</span><span data-fr>Export CSV / PDF et sommaire par courriel</span></span></li>
            </ul>
            <div className="qb-who">💰 <span data-en>For the Treasurer</span><span data-fr>Pour le/la trésorier·ère</span></div>
          </div>
          <div className="qb-mini">
            <h4 className="qb-mh">🧾 Rona · 2026-07-14</h4>
            <div className="qb-recpt">
              <span className="qb-k"><span data-en>Merchant</span><span data-fr>Commerçant</span></span><span className="qb-v">Rona</span>
              <span className="qb-k"><span data-en>Category</span><span data-fr>Catégorie</span></span><span className="qb-v"><span data-en>Maintenance</span><span data-fr>Entretien</span></span>
              <span className="qb-k"><span data-en>Subtotal</span><span data-fr>Sous-total</span></span><span className="qb-v">$182.60</span>
              <span className="qb-k"><span data-en>Tax (GST/QST)</span><span data-fr>Taxes (TPS/TVQ)</span></span><span className="qb-v">$27.32</span>
              <span className="qb-k qb-tot"><span data-en>Grand total</span><span data-fr>Total</span></span><span className="qb-v qb-tot">$209.92</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECURITY */}
      <section className="qb-sec" id="security">
        <div className="qb-wrap">
          <h2 className="qb-h2 qb-cen"><span data-en>Fort-Knox security, by default.</span><span data-fr>Sécurité de niveau Fort Knox, par défaut.</span></h2>
          <p className="qb-ssub"><span data-en>Your members&rsquo; documents deserve more than a shared drive. Every board on Quorly gets bank-grade protection.</span><span data-fr>Les documents de vos membres méritent mieux qu&rsquo;un disque partagé. Chaque conseil bénéficie d&rsquo;une protection de niveau bancaire.</span></p>
          <div className="qb-srow">
            <div className="qb-sb"><span className="qb-se">🔐</span><b><span data-en>Two-factor auth</span><span data-fr>Double authentification</span></b><span><span data-en>Required per board</span><span data-fr>Exigée par conseil</span></span></div>
            <div className="qb-sb"><span className="qb-se">🛡️</span><b><span data-en>End-to-end encryption</span><span data-fr>Chiffrement bout en bout</span></b><span><span data-en>For sensitive files</span><span data-fr>Fichiers sensibles</span></span></div>
            <div className="qb-sb"><span className="qb-se">👁️</span><b><span data-en>Access control</span><span data-fr>Contrôle d&rsquo;accès</span></b><span><span data-en>Member by member</span><span data-fr>Membre par membre</span></span></div>
            <div className="qb-sb"><span className="qb-se">📜</span><b><span data-en>Full audit trail</span><span data-fr>Journal complet</span></b><span><span data-en>Who did what, when</span><span data-fr>Qui, quoi, quand</span></span></div>
            <div className="qb-sb"><span className="qb-se">🇨🇦</span><b><span data-en>Canadian residency</span><span data-fr>Hébergement canadien</span></b><span><span data-en>Data stays in Canada</span><span data-fr>Données au Canada</span></span></div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="qb-price" id="pricing">
        <div className="qb-wrap">
          <div className="qb-ph">
            <h2 className="qb-h2 qb-cen"><span data-en>Simple pricing, per board.</span><span data-fr>Tarifs simples, par conseil.</span></h2>
            <p><span data-en>Start free for 3 months. One flat price per board — invite every member, no per-seat surprises.</span><span data-fr>Gratuit 3 mois. Un prix fixe par conseil — invitez tous les membres, sans frais par siège.</span></p>
          </div>
          <div className="qb-tiers">
            <div className="qb-tier">
              <div className="qb-nm">Free</div>
              <div className="qb-pr">$0</div>
              <div className="qb-u"><span data-en>For a small committee getting started</span><span data-fr>Pour un petit comité qui démarre</span></div>
              <ul className="qb-tul">
                <li>✓ <span><span data-en>1 board, up to 10 members</span><span data-fr>1 conseil, 10 membres</span></span></li>
                <li>✓ <span><span data-en>Minutes, votes &amp; documents</span><span data-fr>PV, votes &amp; documents</span></span></li>
                <li>✓ <span>2 GB <span data-en>storage</span><span data-fr>de stockage</span></span></li>
              </ul>
              <a className="qb-btn qb-btn-ghost" href="/forms"><span data-en>Start free</span><span data-fr>Commencer</span></a>
            </div>
            <div className="qb-tier qb-pop">
              <span className="qb-flag"><span data-en>Most boards</span><span data-fr>Populaire</span></span>
              <div className="qb-nm">Board</div>
              <div className="qb-pr">$39<small>/<span data-en>mo</span><span data-fr>mois</span></small></div>
              <div className="qb-u"><span data-en>Everything a working board needs</span><span data-fr>Tout pour un conseil actif</span></div>
              <ul className="qb-tul">
                <li>✓ <span><span data-en>Unlimited members</span><span data-fr>Membres illimités</span></span></li>
                <li>✓ <span><span data-en>Committees (sub-forms)</span><span data-fr>Comités (sous-formulaires)</span></span></li>
                <li>✓ <span><span data-en>Receipts &amp; expense reports</span><span data-fr>Reçus &amp; rapports de dépenses</span></span></li>
                <li>✓ <span>2FA + <span data-en>download approval</span><span data-fr>approbation téléchargement</span></span></li>
                <li>✓ <span>50 GB <span data-en>storage</span><span data-fr>de stockage</span></span></li>
              </ul>
              <a className="qb-btn qb-btn-primary" href="/forms"><span data-en>Start free pilot</span><span data-fr>Essai gratuit</span></a>
            </div>
            <div className="qb-tier">
              <div className="qb-nm">Business</div>
              <div className="qb-pr">$129<small>/<span data-en>mo</span><span data-fr>mois</span></small></div>
              <div className="qb-u"><span data-en>For associations with staff &amp; several boards</span><span data-fr>Associations avec personnel</span></div>
              <ul className="qb-tul">
                <li>✓ <span><span data-en>Everything in Board</span><span data-fr>Tout de Board</span></span></li>
                <li>✓ <span><span data-en>Up to 5 boards</span><span data-fr>Jusqu&rsquo;à 5 conseils</span></span></li>
                <li>✓ <span><span data-en>End-to-end encryption</span><span data-fr>Chiffrement bout en bout</span></span></li>
                <li>✓ <span><span data-en>Priority support</span><span data-fr>Soutien prioritaire</span></span></li>
                <li>✓ <span>500 GB <span data-en>storage</span><span data-fr>de stockage</span></span></li>
              </ul>
              <a className="qb-btn qb-btn-ghost" href="/forms"><span data-en>Start free</span><span data-fr>Commencer</span></a>
            </div>
            <div className="qb-tier">
              <div className="qb-nm">Enterprise</div>
              <div className="qb-pr"><span data-en>Custom</span><span data-fr>Sur mesure</span></div>
              <div className="qb-u"><span data-en>Federations, unions &amp; large nonprofits</span><span data-fr>Fédérations, syndicats, grands OBNL</span></div>
              <ul className="qb-tul">
                <li>✓ <span><span data-en>Unlimited boards</span><span data-fr>Conseils illimités</span></span></li>
                <li>✓ <span>SSO &amp; <span data-en>custom retention</span><span data-fr>rétention personnalisée</span></span></li>
                <li>✓ <span><span data-en>Dedicated onboarding</span><span data-fr>Intégration dédiée</span></span></li>
                <li>✓ <span><span data-en>Custom storage</span><span data-fr>Stockage sur mesure</span></span></li>
              </ul>
              <a className="qb-btn qb-btn-ghost" href="#contact"><span data-en>Contact us</span><span data-fr>Nous joindre</span></a>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="qb-final" id="contact">
        <div className="qb-wrap">
          <h2 className="qb-h2 qb-cen"><span data-en>Run your next meeting on Quorly.</span><span data-fr>Tenez votre prochaine réunion sur Quorly.</span></h2>
          <p><span data-en>Set up your board in 20 minutes. Free for 3 months — no credit card.</span><span data-fr>Configurez votre conseil en 20 minutes. Gratuit 3 mois — sans carte.</span></p>
          <a className="qb-btn qb-btn-primary qb-btn-lg qb-fcta" href="/forms"><span data-en>Start a free board</span><span data-fr>Créer un conseil gratuit</span> →</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="qb-foot">
        <div className="qb-wrap">
          <div className="qb-fgrid">
            <div>
              <div className="qb-logo qb-footlogo"><div className="qb-row"><span className="qb-q">Q</span><span className="qb-word">Quorly</span></div><Dots /></div>
              <p className="qb-ftag"><span data-en>The calm, secure home for boards and associations — between every meeting.</span><span data-fr>L&rsquo;espace calme et sécurisé des conseils et associations — entre chaque réunion.</span></p>
            </div>
            <div>
              <h5 className="qb-fh"><span data-en>Product</span><span data-fr>Produit</span></h5>
              <a href="#feat"><span data-en>Minutes &amp; votes</span><span data-fr>PV &amp; votes</span></a>
              <a href="#docs"><span data-en>Documents</span><span data-fr>Documents</span></a>
              <a href="#receipts"><span data-en>Receipts</span><span data-fr>Reçus</span></a>
              <a href="#pricing"><span data-en>Pricing</span><span data-fr>Tarifs</span></a>
            </div>
            <div>
              <h5 className="qb-fh"><span data-en>Company</span><span data-fr>Entreprise</span></h5>
              <a href="#security"><span data-en>Security</span><span data-fr>Sécurité</span></a>
              <a href="/forms"><span data-en>Log in</span><span data-fr>Connexion</span></a>
              <a href="#contact"><span data-en>Contact</span><span data-fr>Contact</span></a>
            </div>
            <div>
              <h5 className="qb-fh"><span data-en>Legal</span><span data-fr>Légal</span></h5>
              <a href="/privacy"><span data-en>Privacy</span><span data-fr>Confidentialité</span></a>
              <a href="/privacy"><span data-en>Terms</span><span data-fr>Conditions</span></a>
              <a href="#security"><span data-en>Data residency</span><span data-fr>Hébergement</span></a>
            </div>
          </div>
          <div className="qb-fbottom">
            <span>© 2026 Quorly · <span data-en>Made in Canada 🇨🇦</span><span data-fr>Conçu au Canada 🇨🇦</span></span>
            <span>hello@quorly.ca</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

const CSS = `
.qb{--indigo:#2F3AA3;--indigo-d:#232B7A;--ink:#1C1B19;--muted:#5A6472;--line:#EAE4DA;--cream:#FBF8F2;--cream2:#F4EEE3;--d1:#E8613A;--d2:#F2B01E;--d3:#2FA36B;--d4:#2F3AA3;
  color-scheme:light;background:#fff;color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;overflow-x:hidden;position:relative;z-index:0}
.qb *{box-sizing:border-box}
.qb a{color:inherit;text-decoration:none}
.qb h1,.qb h2,.qb h3,.qb h4,.qb h5{margin:0;letter-spacing:-.02em;font-weight:800;line-height:1.1;color:var(--ink)}
.qb p{margin:0}
.qb .qb-wrap{max-width:1120px;margin:0 auto;padding:0 24px}
.qb .qb-grid>*{min-width:0}
.qb .qb-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:800;font-size:15px;padding:13px 22px;border-radius:12px;border:2px solid transparent;cursor:pointer;transition:.15s;line-height:1;text-align:center;width:auto}
.qb .qb-btn-primary{background:var(--indigo);color:#fff;border-color:var(--indigo)}
.qb .qb-btn-primary:hover{background:var(--indigo-d);border-color:var(--indigo-d)}
.qb .qb-btn-ghost{background:#fff;color:var(--ink);border-color:var(--ink)}
.qb .qb-btn-ghost:hover{background:var(--cream)}
.qb .qb-btn-lg{font-size:16px;padding:15px 26px}
.qb .qb-logo{display:inline-flex;flex-direction:column;align-items:flex-start;line-height:1}
.qb .qb-logo .qb-row{display:flex;align-items:baseline;gap:9px}
.qb .qb-logo .qb-q{font-weight:900;font-size:30px;color:var(--indigo);letter-spacing:-.03em}
.qb .qb-logo .qb-word{font-weight:800;font-size:19px;color:var(--ink);letter-spacing:-.01em}
.qb .qb-dots{display:flex;gap:6px;padding-left:41px;margin-top:6px}
.qb .qb-dots i{width:8px;height:8px;border-radius:50%;display:block}
.qb .qb-hdr{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.92);backdrop-filter:saturate(1.4) blur(8px);border-bottom:1px solid var(--line)}
.qb .qb-nav{display:flex;align-items:center;justify-content:space-between;height:74px}
.qb .qb-links{display:flex;gap:28px;font-weight:600;font-size:15px}
.qb .qb-links a{color:#333}
.qb .qb-links a:hover{color:var(--indigo)}
.qb .qb-right{display:flex;align-items:center;gap:14px}
.qb .qb-lang{display:flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}
.qb .qb-lang button{border:0;background:#fff;padding:7px 11px;cursor:pointer;color:var(--muted);font-weight:700;font-size:13px}
.qb .qb-lang button.on{background:var(--indigo);color:#fff}
@media(max-width:840px){.qb .qb-links{display:none}}
.qb .qb-hero{background:linear-gradient(180deg,var(--cream),#fff);border-bottom:1px solid var(--line)}
.qb .qb-hero .qb-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:56px;align-items:center;padding:74px 0 84px}
.qb .qb-eyebrow{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--indigo);background:#EEF0FB;border:1px solid #DFE3F7;padding:6px 12px;border-radius:999px}
.qb .qb-h1{font-size:54px;margin:20px 0 0}
.qb .qb-sub{font-size:19px;color:#2E2E2B;margin-top:20px;max-width:30em}
.qb .qb-cta{display:flex;gap:14px;margin-top:30px;flex-wrap:wrap}
.qb .qb-micro{margin-top:16px;font-size:13.5px;color:var(--muted)}
@media(max-width:900px){.qb .qb-hero .qb-grid{grid-template-columns:minmax(0,1fr);gap:36px;padding:44px 0 52px}.qb .qb-h1{font-size:38px}}
.qb .qb-shot{background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 28px 60px -30px rgba(35,43,122,.4);overflow:hidden;max-width:100%}
.qb .qb-bar{display:flex;align-items:center;gap:7px;padding:12px 14px;border-bottom:1px solid var(--line);background:var(--cream)}
.qb .qb-bar i{width:11px;height:11px;border-radius:50%;background:#E4DFD4;display:block;flex:none}
.qb .qb-bar b{margin-left:8px;font-size:12.5px;color:var(--muted);font-weight:700}
.qb .qb-shotbody{padding:16px}
.qb .qb-card{border:1px solid var(--line);border-radius:12px;padding:13px 14px;margin-bottom:11px;background:#fff}
.qb .qb-card:last-child{margin-bottom:0}
.qb .qb-t{font-weight:800;font-size:14px;color:var(--ink);display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.qb .qb-t>span:first-child{min-width:0}
.qb .qb-m{font-size:12.5px;color:var(--muted);margin-top:3px}
.qb .qb-pill{font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px;white-space:nowrap;flex:0 0 auto}
.qb .qb-pass{background:#E4F6EC;color:#1E7A48}
.qb .qb-vote{background:#FFF3D6;color:#8A5A00}
.qb .qb-lock{background:#EEF0FB;color:var(--indigo)}
.qb .qb-vrow{display:flex;gap:6px;margin-top:9px}
.qb .qb-vrow span{flex:1;text-align:center;font-size:11px;font-weight:800;padding:6px 0;border-radius:8px;border:1px solid var(--line);min-width:0}
.qb .qb-y{background:#E4F6EC;color:#1E7A48;border-color:#C7ECD5}
.qb .qb-n{background:#FBE9E4;color:#B23C1E;border-color:#F3D2C7}
.qb .qb-abs{color:var(--muted)}
.qb .qb-proof{padding:34px 0;border-bottom:1px solid var(--line);background:#fff}
.qb .qb-proof p{text-align:center;color:var(--muted);font-weight:700;font-size:13px;letter-spacing:.04em;text-transform:uppercase}
.qb .qb-prow{display:flex;gap:40px;justify-content:center;flex-wrap:wrap;margin-top:18px}
.qb .qb-prow span{font-weight:800;font-size:17px;color:#8A8A86}
.qb .qb-feat{padding:78px 0;background:#fff}
.qb .qb-cream{background:var(--cream)}
.qb .qb-feat .qb-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px;align-items:center}
.qb .qb-feat.qb-alt .qb-grid>*:first-child{order:2}
.qb .qb-feat.qb-alt .qb-grid>*:last-child{order:1}
.qb .qb-tag{font-weight:800;font-size:13px;letter-spacing:.05em;text-transform:uppercase}
.qb .qb-h2{font-size:34px;margin:12px 0 0}
.qb .qb-cen{text-align:center;margin:0}
.qb .qb-lead{font-size:17px;color:#3A3A37;margin-top:14px}
.qb .qb-ul{margin:20px 0 0;padding:0;list-style:none}
.qb .qb-ul li{display:flex;gap:11px;align-items:flex-start;font-size:15.5px;color:var(--ink);margin-bottom:12px}
.qb .qb-ul li svg{flex:0 0 auto;margin-top:2px}
.qb .qb-who{position:static;margin:22px 0 0;display:inline-flex;align-items:center;gap:9px;font-weight:800;font-size:13.5px;color:var(--indigo);background:#EEF0FB;padding:8px 13px;border-radius:10px;border:0;width:auto;bottom:auto}
@media(max-width:900px){.qb .qb-feat .qb-grid{grid-template-columns:minmax(0,1fr);gap:28px}.qb .qb-feat.qb-alt .qb-grid>*:first-child,.qb .qb-feat.qb-alt .qb-grid>*:last-child{order:0}.qb .qb-feat{padding:48px 0}.qb .qb-h2{font-size:26px}}
.qb .qb-mini{background:#fff;border:1px solid var(--line);border-radius:16px;padding:15px;box-shadow:0 20px 46px -28px rgba(35,43,122,.35);max-width:100%}
.qb .qb-mh{margin:0 0 10px;font-size:13px;color:var(--muted);font-weight:800;letter-spacing:.04em;text-transform:uppercase}
.qb .qb-filerow{display:flex;align-items:center;gap:11px;padding:10px;border:1px solid var(--line);border-radius:10px;margin-bottom:9px}
.qb .qb-filerow:last-child{margin-bottom:0}
.qb .qb-ic{width:30px;height:30px;border-radius:8px;background:var(--cream2);display:flex;align-items:center;justify-content:center;flex:0 0 auto;font-size:15px}
.qb .qb-fn{font-weight:700;font-size:13.5px;color:var(--ink)}
.qb .qb-fs{font-size:11.5px;color:var(--muted)}
.qb .qb-star{margin-left:auto;font-size:13px;flex:none}
.qb .qb-recpt{display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:13.5px}
.qb .qb-k{color:var(--muted)}
.qb .qb-v{font-weight:700;text-align:right;color:var(--ink)}
.qb .qb-tot{border-top:1px solid var(--line);padding-top:8px;margin-top:4px;font-weight:800}
.qb .qb-sec{background:var(--indigo);color:#fff;padding:70px 0}
.qb .qb-sec .qb-h2{color:#fff}
.qb .qb-ssub{text-align:center;color:#C9CEEC;margin-top:12px;font-size:16px}
.qb .qb-srow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:18px;margin-top:40px}
.qb .qb-sb{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:18px;text-align:center;color:#fff}
.qb .qb-se{font-size:22px}
.qb .qb-sb b{display:block;font-size:14.5px;margin-top:10px;color:#fff}
.qb .qb-sb>span:last-child{font-size:12.5px;color:#BFC5EA;display:block;margin-top:4px}
@media(max-width:900px){.qb .qb-srow{grid-template-columns:repeat(2,minmax(0,1fr))}}
.qb .qb-price{padding:80px 0;background:var(--cream)}
.qb .qb-ph{text-align:center;max-width:36em;margin:0 auto}
.qb .qb-ph p{color:#3A3A37;font-size:17px;margin-top:12px}
.qb .qb-tiers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:44px}
.qb .qb-tier{background:#fff;border:1px solid var(--line);border-radius:16px;padding:24px 20px;display:flex;flex-direction:column}
.qb .qb-pop{border:2px solid var(--indigo);box-shadow:0 24px 50px -28px rgba(35,43,122,.5);position:relative}
.qb .qb-flag{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--indigo);color:#fff;font-weight:800;font-size:11px;letter-spacing:.05em;text-transform:uppercase;padding:5px 12px;border-radius:999px;white-space:nowrap}
.qb .qb-nm{font-weight:800;font-size:16px;color:var(--ink)}
.qb .qb-pr{font-size:34px;font-weight:900;margin:10px 0 2px;letter-spacing:-.02em;color:var(--ink)}
.qb .qb-pr small{font-size:14px;font-weight:700;color:var(--muted)}
.qb .qb-u{font-size:13px;color:var(--muted);min-height:34px}
.qb .qb-tul{list-style:none;padding:0;margin:16px 0 22px}
.qb .qb-tul li{font-size:13.5px;padding:7px 0;border-top:1px solid var(--line);display:flex;gap:8px;color:var(--ink)}
.qb .qb-tier .qb-btn{width:100%;margin-top:auto}
@media(max-width:900px){.qb .qb-tiers{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.qb .qb-tiers{grid-template-columns:minmax(0,1fr)}}
.qb .qb-final{background:linear-gradient(135deg,var(--indigo),var(--indigo-d));color:#fff;padding:78px 0;text-align:center}
.qb .qb-final .qb-h2{color:#fff}
.qb .qb-final p{color:#D2D6F0;font-size:18px;margin-top:14px}
.qb .qb-fcta{margin-top:28px;background:#fff;color:var(--indigo);border-color:#fff}
.qb .qb-fcta:hover{background:var(--cream);border-color:var(--cream)}
.qb .qb-foot{background:#14131A;color:#B7B7BE;padding:56px 0 34px;font-size:14px}
.qb .qb-fgrid{display:grid;grid-template-columns:1.4fr repeat(3,1fr);gap:32px}
.qb .qb-fh{color:#fff;font-size:13px;letter-spacing:.05em;text-transform:uppercase;margin:0 0 14px}
.qb .qb-foot a{display:block;padding:6px 0;color:#B7B7BE}
.qb .qb-foot a:hover{color:#fff}
.qb .qb-ftag{margin-top:16px;max-width:24em;color:#8C8C94}
.qb .qb-footlogo .qb-q{color:#fff}.qb .qb-footlogo .qb-word{color:#fff}
.qb .qb-fbottom{display:flex;justify-content:space-between;align-items:center;margin-top:40px;padding-top:22px;border-top:1px solid #2A2933;color:#7C7C86;font-size:13px;flex-wrap:wrap;gap:12px}
@media(max-width:840px){.qb .qb-fgrid{grid-template-columns:1fr 1fr;gap:26px}}
.qb [data-fr]{display:none}
.qb.fr [data-en]{display:none}
.qb.fr [data-fr]{display:revert}
`;
