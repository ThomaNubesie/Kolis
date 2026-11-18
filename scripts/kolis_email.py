#!/usr/bin/env python3
"""Standard Kolis email sender — Style 5 (corporate letterhead), sends from kolis.ca,
auto-logs to the kolis_emails tracking ledger (joins Resend webhook events in kolis_email_status).

Usage:
  from kolis_email import send
  send(to="x@y.com", subject="...", body_html="<p>...</p>",
       cta=("Suivre le colis / Track","https://kolis.ca"), kind="tracking", ref="KL-3339")
"""
import json, os, urllib.request
REF = "kzjptcpjpwlxfofzhyku"
PAT = open(os.path.expanduser("~/.supabase-pat")).read().strip()
MAG="#E11D6B"; INK="#141517"; MUT="#6b6b72"

def _mgmt(q):
    r=urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query",
      data=json.dumps({"query":q}).encode(),headers={"Authorization":f"Bearer {PAT}","Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(r,timeout=40))

def _srk():
    return _mgmt("select decrypted_secret as k from vault.decrypted_secrets where name='edge_service_key' limit 1")[0]["k"]

def render(body_html, cta=None):
    """Style 5 — corporate letterhead. body_html = inner content; cta=(label,url) optional."""
    btn = (f'<div style="margin:22px 0"><a href="{cta[1]}" style="display:inline-block;border:1.5px solid {MAG};'
           f'color:{MAG};text-decoration:none;font-weight:700;padding:10px 20px;border-radius:4px">{cta[0]}</a></div>') if cta else ""
    return (f'<div style="background:#fff;padding:34px 0;font-family:Georgia,\'Times New Roman\',serif">'
      f'<table width="580" align="center" cellpadding="0" cellspacing="0" style="margin:auto">'
      f'<tr><td style="padding-bottom:14px;border-bottom:2px solid {INK}">'
      f'<span style="font-size:22px;font-weight:700;color:{INK};letter-spacing:.5px">CONCORD EXPRESS</span>'
      f'<span style="color:{MAG};font-weight:700"> · Kolis</span>'
      f'<div style="font-size:12px;color:{MUT};letter-spacing:2px;text-transform:uppercase;margin-top:4px">'
      f'Expédition de colis · Parcel delivery</div></td></tr>'
      f'<tr><td style="padding:24px 0;color:{INK};font-size:16px;line-height:1.7;font-family:Arial,sans-serif">'
      f'{body_html}{btn}</td></tr>'
      f'<tr><td style="border-top:1px solid #ddd;padding-top:14px;color:{MUT};font-size:12px;font-family:Arial,sans-serif">'
      f'Concord Express Co Inc. · Ottawa, Ontario, Canada · kolis.ca · concordexpress.ca · (+1) 613-862-2639</td></tr>'
      f'</table></div>')

def send(to, subject, body_html, cta=None, kind=None, ref=None, text=None, attachments=None, scheduled_at=None):
    # attachments: list of local file paths (e.g. a branded PDF one-pager). They are
    # base64'd here and passed through loadq-send-email to Resend.
    srk=_srk()
    html=render(body_html, cta)
    body={"to":to,"subject":subject,"html":html,"text":text or subject}
    # scheduled_at: ISO 8601 (e.g. "2026-11-19T14:00:00Z"). Resend holds it until then.
    if scheduled_at: body["scheduled_at"]=scheduled_at
    if attachments:
        import base64, os
        body["attachments"]=[{"filename":os.path.basename(f),
                              "content":base64.b64encode(open(f,"rb").read()).decode()}
                             for f in attachments]
    payload=json.dumps(body).encode()
    req=urllib.request.Request(f"https://{REF}.supabase.co/functions/v1/loadq-send-email",data=payload,
        headers={"Authorization":f"Bearer {srk}","Content-Type":"application/json"})
    resp=json.load(urllib.request.urlopen(req,timeout=45))
    rid=None
    try: rid=json.loads(resp.get("resp","{}")).get("id")
    except Exception: pass
    # log to ledger
    if rid:
        esc=lambda s:(s or "").replace("'","''")
        _mgmt(f"select public.kolis_log_email('{esc(rid)}','{esc(to)}','{esc(subject)}','{esc(kind)}','{esc(ref)}')")
    print(f"email -> ok={resp.get('ok')} resend_id={rid} logged={bool(rid)}")
    return rid

if __name__ == "__main__":
    # demo
    send(to="shaloderick@gmail.com", subject="Kolis — test Style 5 + tracking",
         body_html="<p>Bonjour,</p><p>Email de test (Style 5) avec suivi.</p>",
         cta=("Suivre / Track","https://kolis.ca"), kind="test", ref="demo")
