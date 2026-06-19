"use client";
import { useLang, LangToggle } from "@/lib/i18n";

// Public marketing landing for business.kolis.ca — shown to logged-out visitors
// (store owners who received an outreach letter/email). Signed-in users never
// see this; app/page.tsx routes them to their dashboard. Onboarding is
// invite-only, so the CTAs are "Request access" (email) + "Log in", NOT signup.
// All classes are kl-prefixed + scoped under .klb to avoid clashing with globals.css.
const CONTACT = "mailto:marketing@concordexpress.ca?subject=Kolis%20Business%20%E2%80%94%20Request%20access";

const CSS = `
.klb{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1722;background:#fff;line-height:1.55}
.klb *{box-sizing:border-box}
.klb .wrap{max-width:1080px;margin:0 auto;padding:0 28px}
.klb a{text-decoration:none;color:inherit}
.klb .b{display:inline-block;background:#E11D6B;color:#fff;font-weight:700;padding:13px 22px;border-radius:11px;font-size:15px;border:1.5px solid #E11D6B;cursor:pointer}
.klb .b.g{background:#fff;color:#E11D6B}
.klb .nav{display:flex;align-items:center;justify-content:space-between;padding:18px 28px;max-width:1080px;margin:0 auto}
.klb .brandr{display:flex;align-items:center;gap:10px;font-weight:900;font-size:20px}
.klb .lg{width:38px;height:38px;border-radius:11px;background:#E11D6B;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800}
.klb .nl{display:flex;align-items:center;gap:24px;font-weight:600;color:#6B6675;font-size:15px}
.klb .hero{display:flex;gap:48px;align-items:center;padding:50px 0 38px}
.klb .hero .l{flex:1.05}
.klb .hero h1{font-size:46px;line-height:1.08;letter-spacing:-1px;margin:0 0 18px}
.klb .hero h1 .a{color:#E11D6B}
.klb .sub{font-size:19px;color:#6B6675;margin:0 0 26px;max-width:480px}
.klb .cta{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.klb .hero .r{flex:.95;display:flex;justify-content:center}
.klb .dev{background:#fff;border:1px solid #ECECF2;border-radius:20px;box-shadow:0 24px 60px rgba(225,29,107,.14);padding:14px;width:100%;max-width:380px}
.klb .dev img{width:100%;border-radius:12px;display:block}
.klb .pill{display:inline-flex;gap:8px;align-items:center;background:#FBF3F7;color:#9c1048;font-weight:700;font-size:13px;padding:7px 13px;border-radius:99px;margin-bottom:20px}
.klb .note{margin-top:14px;font-size:13.5px;color:#6B6675}
.klb .note a{color:#E11D6B;font-weight:700}
.klb .strip{background:#1a1722;color:#fff;padding:16px 0;text-align:center;font-weight:600;font-size:15px}
.klb .strip b{color:#ff9ec7}
.klb section{padding:60px 0}
.klb .eb{color:#E11D6B;font-weight:800;letter-spacing:1px;text-transform:uppercase;font-size:13px;text-align:center;margin-bottom:10px}
.klb h2{font-size:34px;text-align:center;letter-spacing:-.5px;margin:0 0 8px}
.klb .lede{text-align:center;color:#6B6675;font-size:17px;max-width:560px;margin:0 auto 38px}
.klb .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.klb .card{border:1px solid #ECECF2;border-radius:16px;padding:24px}
.klb .ic{width:44px;height:44px;border-radius:12px;background:#FBF3F7;color:#E11D6B;display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:14px}
.klb .card h3{font-size:19px;margin:0 0 6px}
.klb .card p{color:#6B6675;font-size:15px;margin:0}
.klb .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.klb .step{text-align:center}
.klb .step .n{width:46px;height:46px;border-radius:50%;background:#E11D6B;color:#fff;font-weight:800;font-size:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
.klb .step h3{font-size:18px;margin:0 0 6px}
.klb .step p{color:#6B6675;font-size:15px;margin:0}
.klb .price{background:#FBF3F7;border-radius:24px;padding:48px;text-align:center;max-width:680px;margin:0 auto}
.klb .big{font-size:84px;font-weight:900;color:#E11D6B;line-height:1}
.klb .of{font-size:20px;color:#1a1722;margin:6px 0 4px;font-weight:700}
.klb .pn{color:#6B6675;font-size:16px;margin-bottom:24px}
.klb .checks{display:flex;gap:24px;justify-content:center;flex-wrap:wrap;font-weight:600;font-size:15px;margin-bottom:26px}
.klb .checks span::before{content:"✓ ";color:#178a5e;font-weight:800}
.klb .final{background:#1a1722;color:#fff;border-radius:24px;padding:54px;text-align:center}
.klb .final h2{color:#fff}.klb .final p{color:#cfc9d6;margin-bottom:26px}
.klb .ft{padding:40px 0;color:#6B6675;font-size:14px;text-align:center;border-top:1px solid #ECECF2;margin-top:40px}
.klb .ft a{color:#E11D6B;font-weight:600}
@media(max-width:760px){
  .klb .nav{padding:14px 18px}
  .klb .brandr{font-size:18px;gap:8px}
  .klb .lg{width:34px;height:34px;font-size:15px}
  .klb .nl{gap:10px}
  .klb .nl a:not(.b){display:none}      /* hide section links on mobile; keep EN/FR toggle + Log in */
  .klb .b{padding:10px 16px;font-size:14px}
  .klb .hero{flex-direction:column}
  .klb .grid,.klb .steps{grid-template-columns:1fr}
  .klb .hero h1{font-size:34px}
  .klb .wrap{padding:0 18px}
  .klb section{padding:40px 0}
  .klb .final{padding:34px 22px}
  .klb .ft{margin-top:24px;padding:26px 0 30px}
}
.klb{overflow-x:hidden}
`;

export default function Landing() {
  const { t } = useLang();
  return (
    <div className="klb">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <nav className="nav">
        <div className="brandr"><div className="lg">Ko</div>Kolis <span style={{ color: "#E11D6B" }}>· Business</span></div>
        <div className="nl">
          <a href="#features">{t("Features", "Caractéristiques")}</a>
          <a href="#how">{t("How it works", "Comment ça marche")}</a>
          <a href="#pricing">{t("Pricing", "Tarifs")}</a>
          <LangToggle />
          <a className="b g" href="/login">{t("Log in", "Connexion")}</a>
        </div>
      </nav>

      <div className="wrap">
        <div className="hero">
          <div className="l">
            <span className="pill">● Ottawa · Montréal · Québec — {t("same-day", "le jour même")}</span>
            <h1>{t("Same-day local delivery, ", "La livraison locale le jour même, ")}<span className="a">{t("built into your business.", "intégrée à votre entreprise.")}</span></h1>
            <p className="sub">{t(
              "Send parcels across the corridor with real local couriers — a dedicated dashboard, bulk import, live tracking, and one monthly invoice. No fleet to manage.",
              "Expédiez vos colis sur le corridor avec de vrais coursiers locaux — un tableau de bord dédié, l'import en lot, le suivi en direct et une seule facture mensuelle. Aucune flotte à gérer.")}</p>
            <div className="cta">
              <a className="b" href={CONTACT}>{t("Request access", "Demander l'accès")}</a>
              <a className="b g" href="#how">{t("See how it works", "Voir comment ça marche")}</a>
            </div>
            <p className="note">{t("By invitation — we set up your account for you. Already invited? ", "Sur invitation — nous configurons votre compte pour vous. Déjà invité ? ")}
              <a href="/login">{t("Log in", "Connectez-vous")}</a>.</p>
          </div>
          <div className="r"><div className="dev"><img src="/kolis-features.gif" alt="Kolis · Business" /></div></div>
        </div>
      </div>

      <div className="strip">{t("Places we serve — ", "Villes desservies — ")}<b>Ottawa · Montréal · Québec · Chicoutimi · Brockville · Kingston · Toronto · Niagara</b></div>

      <section id="features"><div className="wrap">
        <div className="eb">{t("What you get", "Ce que vous obtenez")}</div>
        <h2>{t("Everything to run deliveries from one screen", "Tout pour gérer vos livraisons depuis un seul écran")}</h2>
        <p className="lede">{t("Kolis · Business turns the LoadQ courier network into your same-day delivery arm.", "Kolis · Business transforme le réseau de coursiers LoadQ en votre service de livraison le jour même.")}</p>
        <div className="grid">
          <div className="card"><div className="ic">▦</div><h3>{t("Dedicated dashboard", "Tableau de bord dédié")}</h3><p>{t("Overview, shipments, invoices and team — bilingual FR/EN, one place.", "Aperçu, envois, factures et équipe — bilingue FR/EN, au même endroit.")}</p></div>
          <div className="card"><div className="ic">⇪</div><h3>{t("Bulk import", "Import en lot")}</h3><p>{t("Create dozens of shipments in one operation — perfect for recurring orders.", "Créez des dizaines d'envois en une seule opération — idéal pour les commandes récurrentes.")}</p></div>
          <div className="card"><div className="ic">◎</div><h3>{t("Real-time tracking", "Suivi en temps réel")}</h3><p>{t("Every parcel tracked in transit. Customers get live updates + a delivery code.", "Chaque colis suivi en transit. Vos clients reçoivent des mises à jour en direct + un code de livraison.")}</p></div>
          <div className="card"><div className="ic">＄</div><h3>{t("Monthly billing", "Facturation mensuelle")}</h3><p>{t("Billed on account — no card charged per shipment, no subscription.", "Facturation sur compte — aucune carte débitée par envoi, aucun abonnement.")}</p></div>
        </div>
      </div></section>

      <section id="how" style={{ background: "#FBF3F7" }}><div className="wrap">
        <div className="eb">{t("How it works", "Comment ça marche")}</div>
        <h2>{t("Up and running in a day", "Opérationnel en une journée")}</h2>
        <p className="lede"></p>
        <div className="steps">
          <div className="step"><div className="n">1</div><h3>{t("Create the shipment", "Créez l'envoi")}</h3><p>{t("One at a time or bulk-import — we price it instantly.", "Un à la fois ou en lot — nous calculons le prix instantanément.")}</p></div>
          <div className="step"><div className="n">2</div><h3>{t("A local courier picks up", "Un coursier local récupère")}</h3><p>{t("Drivers already on your corridor handle pickup and delivery.", "Des conducteurs déjà sur votre corridor s'occupent de la cueillette et de la livraison.")}</p></div>
          <div className="step"><div className="n">3</div><h3>{t("Track & get paid monthly", "Suivez et payez mensuellement")}</h3><p>{t("Live tracking for everyone; one clean invoice at month-end.", "Suivi en direct pour tous ; une seule facture claire en fin de mois.")}</p></div>
        </div>
      </div></section>

      <section id="pricing"><div className="wrap">
        <div className="eb">{t("Pricing", "Tarifs")}</div>
        <h2>{t("Simple, no surprises", "Simple, sans surprises")}</h2>
        <p className="lede"></p>
        <div className="price">
          <div className="big">20%</div>
          <div className="of">{t("of the total delivery price", "du prix total de livraison")}</div>
          <div className="pn">{t("Monthly billing on account · no subscription · no upfront fixed costs", "Facturation mensuelle sur compte · aucun abonnement · aucuns frais fixes initiaux")}</div>
          <div className="checks"><span>{t("No fleet to manage", "Aucune flotte à gérer")}</span><span>{t("Bilingual FR/EN", "Bilingue FR/EN")}</span><span>{t("Cancel anytime", "Annulez à tout moment")}</span></div>
          <a className="b" href={CONTACT}>{t("Request access", "Demander l'accès")}</a>
        </div>
      </div></section>

      <section><div className="wrap"><div className="final">
        <h2>{t("Ready to deliver same-day?", "Prêt à livrer le jour même ?")}</h2>
        <p>{t("Join Kolis · Business and capture the sales that distance was costing you.", "Rejoignez Kolis · Business et captez les ventes que la distance vous faisait perdre.")}</p>
        <a className="b g" style={{ background: "#fff" }} href={CONTACT}>{t("Request access", "Demander l'accès")}</a>
      </div></div></section>

      <footer className="ft"><div className="wrap">
        {t("Kolis · Business — operated by ", "Kolis · Business — exploité par ")}<b>Concord Express Co Inc.</b><br />
        <a href="https://kolis.ca">kolis.ca</a> · <a href="https://www.concordexpress.ca">concordexpress.ca</a> · support@concordexpress.ca · (613) 862-2639 · Ottawa / Gatineau<br />
        <a href="/privacy">{t("Privacy", "Confidentialité")}</a> · <a href="/login">{t("Log in", "Connexion")}</a>
      </div></footer>
    </div>
  );
}
