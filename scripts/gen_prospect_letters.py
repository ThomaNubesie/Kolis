# -*- coding: utf-8 -*-
# Generate bilingual Kolis · Business proposal PDFs for lab prospects.
# Green Concord-Express letterhead + magenta Kolis blocks (matches the auto-parts
# letters). Run locally: python3 scripts/gen_prospect_letters.py  (needs Chrome).
import os, html
OUT = os.path.expanduser("~/Downloads/kolis-offers")
HTMLDIR = os.path.join(OUT, "_html_labs"); os.makedirs(HTMLDIR, exist_ok=True)
DATE_FR, DATE_EN = "19 juin 2026", "June 19, 2026"

FEATURES = [
 ("Ramassage le jour même","Spécimens et échantillons de vos sites vers le laboratoire central — plusieurs fois par jour, suivi en temps réel.",
  "Same-day pickup","Specimens & samples from your sites to the central lab — several times daily, tracked in real time."),
 ("Appoint STAT / après-heures","En renfort de votre service actuel : débordement, urgences STAT, soirs et fins de semaine.",
  "STAT / after-hours backup","Backs up your current service: overflow, STAT runs, evenings and weekends."),
 ("Chaîne de possession","Manipulation soignée et sensible à la température, traçabilité de bout en bout, code de remise.",
  "Chain-of-custody","Careful, temperature-aware handling, end-to-end traceability, delivery code."),
 ("Facturation mensuelle","20 % du prix de livraison, sur compte — aucun abonnement, aucune flotte à gérer.",
  "Monthly billing","20% of the delivery price, on account — no subscription, no fleet to manage."),
]
ABOUT_FR=("Kolis est une plateforme de livraison de Concord Express Co Inc., entreprise technologique de transport basée à Ottawa. "
 "Nos conducteurs, issus du réseau LoadQ, couvrent le corridor Ottawa–Gatineau–Montréal toute la journée — prêts à transporter vos spécimens rapidement et de façon fiable.")
ABOUT_EN=("Kolis is a delivery platform by Concord Express Co Inc., an Ottawa-based transport technology company. "
 "Our drivers, from the LoadQ network, cover the Ottawa–Gatineau–Montreal corridor all day — ready to move your specimens quickly and reliably.")
CTA_FR=("Je serais honoré de vous présenter Kolis · Business en 20 à 30 minutes, à votre convenance. (613) 862-2639 · marketing@concordexpress.ca.")
CTA_EN=("I would be honoured to present Kolis · Business in 20–30 minutes, at your convenience. (613) 862-2639 · marketing@concordexpress.ca.")

MED_FR=lambda n,hook:(f"C'est avec beaucoup de respect que je vous adresse cette lettre. {n} fait partie des réseaux de diagnostic qui font avancer les soins dans la région — {hook} Chaque jour, vos centres de prélèvement acheminent des spécimens vers votre laboratoire central, et chaque minute compte.")
MED_EN=lambda n,hook:(f"It is with great respect that I write to you. {n} is among the diagnostic networks advancing care in our region — {hook} Every day your collection sites move specimens to your central lab, and every minute counts.")
MED_CH_FR="Le transport de spécimens est récurrent, sensible au temps et à la température. Kolis · Business s'intègre en appoint STAT, débordement et après-heures de votre service actuel — le jour même, sur le corridor, avec suivi en temps réel et chaîne de possession."
MED_CH_EN="Specimen transport is recurring, time- and temperature-sensitive. Kolis · Business plugs in as STAT, overflow and after-hours backup to your current service — same-day, across the corridor, with real-time tracking and chain-of-custody."
ENV_FR=lambda n,hook:(f"C'est avec respect que je vous adresse cette lettre. {n} reçoit chaque jour des échantillons d'entrepreneurs, d'inspecteurs et de particuliers — {hook} et bon nombre de ces analyses sont liées à des délais serrés.")
ENV_EN=lambda n,hook:(f"It is with respect that I write to you. {n} receives samples daily from contractors, inspectors and homeowners — {hook} and much of this work is deadline-bound.")
ENV_CH_FR="Permis d'occupation, dégagements d'amiante, échéances réglementaires : le ramassage à temps fait la différence. Kolis · Business garantit la cueillette le jour même de vos échantillons (sol, eau, air) vers votre laboratoire, avec suivi du terrain au labo."
ENV_CH_EN="Occupancy permits, asbestos clearances, regulatory deadlines: on-time pickup makes the difference. Kolis · Business guarantees same-day pickup of your samples (soil, water, air) to your lab, tracked from field to lab."

LABS=[
 ("LifeLabs","medical-lab","1380 Upper Canada St, Stittsville","Ottawa","le plus grand réseau communautaire de l'Ontario.","Ontario's largest community network.","kolis-offre-lifelabs"),
 ("Dynacare","medical-lab","2555 St Joseph Blvd #208, Orléans","Ottawa","un réseau de prélèvement à l'échelle de la ville.","a city-wide collection network.","kolis-offre-dynacare"),
 ("Bio-Test Laboratory","medical-lab","2006 Robertson Rd","Ottawa","un chef de file local reconnu sur plusieurs sites.","a respected local operator across several sites.","kolis-offre-bio-test"),
 ("Canadian Diagnostic Network","medical-lab","1181 Hunt Club Rd","Ottawa","un réseau diagnostic multi-sites.","a multi-site diagnostic network.","kolis-offre-cdn"),
 ("Eurofins","environmental-lab","146 Colonnade Rd S, Nepean","Ottawa","un laboratoire environnemental d'envergure mondiale,","a world-class environmental lab,","kolis-offre-eurofins"),
 ("Paracel Laboratories","environmental-lab","2319 St. Laurent Blvd, Suite 300","Ottawa","un laboratoire environnemental bien établi,","a well-established environmental lab,","kolis-offre-paracel"),
 ("Caduceon Environmental Laboratories","environmental-lab","2378 Holly Ln","Ottawa","reconnu pour son intake régulier d'eau et de sol,","known for steady water and soil intake,","kolis-offre-caduceon"),
 ("EMSL Canada","environmental-lab","22 Antares Dr, Nepean","Ottawa","spécialiste des tests d'amiante et de matériaux,","an asbestos and materials testing specialist,","kolis-offre-emsl"),
]
TAGS={"medical-lab":["STAT","Spécimens","Chaîne de possession","Le jour même"],"environmental-lab":["Sol · Eau · Air","Amiante","Délais","Le jour même"]}

CSS=open(os.path.join(os.path.dirname(__file__) or ".","_letter_css.txt")).read() if os.path.exists(os.path.join(os.path.dirname(__file__) or ".","_letter_css.txt")) else """
@page{size:Letter;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:'Helvetica Neue',Arial,sans-serif;color:#1c1c1c;font-size:11.5px;line-height:1.5}
.page{padding:118px 46px 92px}
.topbar{position:fixed;top:0;left:0;right:0;height:96px;background:#0E4A38;color:#fff;display:flex;align-items:center;padding:0 28px}
.logo{width:74px;height:74px;border:2px solid #19A96E;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;margin-right:18px}
.logo b{color:#19A96E;font-size:26px;line-height:1;letter-spacing:1px}.logo span{color:#19A96E;font-size:8.5px;letter-spacing:2px;margin-top:3px}
.topbar .co{font-size:19px;font-weight:800}.topbar .tl{color:#7FE3B8;font-size:9.5px;margin-top:2px}.topbar .tl2{color:#cfe9dd;font-size:9px}.topbar .tl3{color:#7FE3B8;font-size:10px;font-style:italic;margin-top:2px}
.botbar{position:fixed;bottom:0;left:0;right:0;height:64px;background:#0E4A38;color:#cfe9dd;display:flex;align-items:center;justify-content:space-between;padding:0 30px;font-size:9px}
.botbar .mid{background:#136b4f;align-self:stretch;display:flex;flex-direction:column;justify-content:center;padding:0 26px;color:#eafff5}
.meta{display:flex;justify-content:space-between;color:#666;font-size:10px;margin-bottom:14px}.meta .rcpt{text-align:right;color:#1c1c1c}.meta .rcpt b{font-size:11px}
.banner{background:#E11D6B;color:#fff;padding:11px 16px;border-radius:4px;display:flex;justify-content:space-between;font-weight:700;font-size:12px;margin:6px 0 12px}.banner .r{color:#ffd0e4;font-weight:600;font-size:10px}
.subj{border:1.5px solid #19A96E;border-radius:6px;padding:9px 14px;display:flex;justify-content:space-between;background:#f1faf5;margin-bottom:14px}.subj .fr{font-weight:700;color:#0E4A38;font-size:11px}.subj .en{color:#6b6b6b;font-size:11px;text-align:right}
.sal{display:flex;justify-content:space-between;font-weight:700;margin:4px 0 10px}.sal .en{color:#6b6b6b}
.cols{display:flex;gap:20px;margin-bottom:10px}.cols .c{flex:1}.cols .en{color:#6f6f6f}.cols p{margin:0 0 9px}.lead{border-left:3px solid #19A96E;padding-left:12px}
.sectttl{text-align:center;color:#9c1048;font-weight:800;font-size:10px;letter-spacing:.6px;margin:16px 0 10px}
.grid{display:flex;flex-wrap:wrap;gap:10px}.cell{width:calc(50% - 5px);border:1px solid #f3cfe0;border-radius:6px;padding:10px 12px;background:#fdf4f8}.cell h4{margin:0 0 4px;color:#b3145e;font-size:10.5px}.cell p{margin:0;font-size:9.5px}.cell.enc{background:#fffafc}.cell.enc h4{color:#c95b8a}.cell.enc p{color:#7a7a7a}
.tags{border:1px solid #f3cfe0;border-radius:6px;padding:10px;margin:14px 0}.tagsl{text-align:center;color:#777;font-size:9px;margin-bottom:8px}.tagrow{display:flex;justify-content:center;flex-wrap:wrap;gap:8px}.tag{border:1px solid #E11D6B;color:#9c1048;border-radius:4px;padding:5px 11px;font-weight:700;font-size:9.5px;background:#fdeef4}
.cta{border:1.5px solid #19A96E;border-radius:6px;background:#f1faf5;padding:12px 14px;display:flex;gap:20px;margin:12px 0}.cta .c{flex:1}.cta .fr{font-weight:700;color:#0E4A38}.cta .en{color:#6b6b6b;font-weight:600}
.sig{margin-top:18px;border-top:1px solid #d6ece1;padding-top:12px;display:flex;justify-content:space-between}.sig .who b{font-size:11px}.sig .who{font-size:10px;color:#333}.sig .lines{text-align:right;color:#0E4A38;font-size:9.5px}.sig .lines .ln{border-top:1px solid #888;width:210px;margin:18px 0 3px auto}
"""

def E(s): return html.escape(s)
def build(name,cat,addr,city,hook_fr,hook_en):
    if cat=="medical-lab": p1f,p1e,p2f,p2e=MED_FR(name,hook_fr),MED_EN(name,hook_en),MED_CH_FR,MED_CH_EN
    else: p1f,p1e,p2f,p2e=ENV_FR(name,hook_fr),ENV_EN(name,hook_en),ENV_CH_FR,ENV_CH_EN
    feats="".join(f'<div class="cell"><h4>■ {E(a)}</h4><p>{E(b)}</p></div><div class="cell enc"><h4>■ {E(c)}</h4><p>{E(d)}</p></div>' for a,b,c,d in FEATURES)
    tags="".join(f'<span class="tag">{E(x)}</span>' for x in TAGS[cat])
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="topbar"><div class="logo"><b>CX</b><span>CONCORD</span></div><div><div class="co">Concord Express Co Inc.</div>
<div class="tl">Intercity carpooling · Canada · France · West Africa</div><div class="tl2">Transport des personnes · Expédition · Gestion de la file d'attente</div><div class="tl3">Là-bas aujourd'hui !</div></div></div>
<div class="botbar"><div>kolis.ca · marketing@concordexpress.ca</div><div class="mid">Ottawa / Gatineau<br>(613) 862-2639</div><div>www.concordexpress.ca</div></div>
<div class="page">
 <div class="meta"><div>{E(city)}, Canada<br>{DATE_FR} / {DATE_EN}</div><div class="rcpt"><b>{E(name)}</b><br>{E(addr)}</div></div>
 <div class="banner"><div>■ KOLIS · BUSINESS</div><div class="r">Transport de spécimens · Specimen transport · business.kolis.ca</div></div>
 <div class="subj"><div class="fr">Objet : Transport de spécimens le jour même — Kolis · Business</div><div class="en">Re: Same-day specimen transport — Kolis · Business</div></div>
 <div class="sal"><div>Madame, Monsieur,</div><div class="en">Dear Sir or Madam,</div></div>
 <div class="cols"><div class="c lead"><p>{E(p1f)}</p><p>{E(p2f)}</p></div><div class="c en lead"><p>{E(p1e)}</p><p>{E(p2e)}</p></div></div>
 <div class="sectttl">CE QUE KOLIS · BUSINESS VOUS APPORTE / WHAT KOLIS · BUSINESS BRINGS YOU</div>
 <div class="grid">{feats}</div>
 <div class="cols" style="margin-top:14px"><div class="c lead"><p>{E(ABOUT_FR)}</p></div><div class="c en lead"><p>{E(ABOUT_EN)}</p></div></div>
 <div class="tags"><div class="tagsl">Votre domaine / Your field</div><div class="tagrow">{tags}</div></div>
 <div class="cta"><div class="c"><p class="fr">■ {E(CTA_FR)}</p></div><div class="c"><p class="en">■ {E(CTA_EN)}</p></div></div>
 <div class="sig"><div class="who"><b>Thomas Derick Shalo</b><br>Fondateur &amp; PDG / Founder &amp; CEO<br>Concord Express Co Inc.<br>(613) 862-2639 · marketing@concordexpress.ca</div>
  <div class="lines"><div class="ln"></div>Signature<div class="ln"></div>Date : {DATE_FR}</div></div>
</div></body></html>"""

for name,cat,addr,city,hf,he,fn in LABS:
    open(os.path.join(HTMLDIR,fn+".html"),"w",encoding="utf-8").write(build(name,cat,addr,city,hf,he))
    print("HTML:",fn)
print("COUNT",len(LABS))
