#!/usr/bin/env python3
"""Branded Kolis-for-Business one-pager for Conval-Aid. PIL (no Chrome)."""
import os
def OUT(name): return os.path.join(os.path.expanduser("~/Downloads"), name)
from PIL import Image, ImageDraw, ImageFont
K=2
def m(v): return int(v*K)
AB="/System/Library/Fonts/Supplemental/Arial Bold.ttf"; AR="/System/Library/Fonts/Supplemental/Arial.ttf"
def fo(p,s): return ImageFont.truetype(p,int(s*K))
MAG=(225,29,107); INK=(17,17,17); MUT=(110,110,116); WHITE=(255,255,255); BLACK=(10,10,10)
PINK_BG=(253,242,247); PINK_BD=(230,120,165)
ACC=[(225,29,107),(240,136,58),(255,206,0),(62,199,138),(10,132,255),(142,91,234)]
W,H=1040,1560
im=Image.new("RGB",(m(W),m(H)),WHITE); d=ImageDraw.Draw(im)
def tw(s,f): return d.textbbox((0,0),s,font=f)[2]
def text(x,y,s,f,fill): d.text((m(x),m(y)),s,font=f,fill=fill)
def rr(b,r,**k): d.rounded_rectangle([m(b[0]),m(b[1]),m(b[2]),m(b[3])],radius=m(r),**k)
def wrap(s,f,mw):
    out=[];cur=""
    for w_ in s.split(" "):
        t=(cur+" "+w_).strip()
        if tw(t,f)<=m(mw): cur=t
        else: out.append(cur); cur=w_
    if cur: out.append(cur)
    return out

# header
d.rectangle([0,0,m(W),m(150)],fill=MAG)
rr([40,36,214,110],16,fill=BLACK); text(66,52,"KOLIS",fo(AB,44),MAG)
text(250,42,"Kolis for Business",fo(AB,46),WHITE)
text(252,104,"Concord Express Co Inc. — Delivery dashboard",fo(AB,22),(255,215,230))
seg=W/len(ACC)
for i,c in enumerate(ACC): d.rectangle([m(i*seg),m(150),m((i+1)*seg),m(157)],fill=c)

# title
text(44,190,"A delivery dashboard built for Conval-Aid",fo(AB,40),INK)
for i,ln in enumerate(wrap("You ship mobility and home-medical equipment across Eastern Ontario — often to clients in remote towns. business.kolis.ca lets you create, brand, track, and account for every one of those deliveries in one place.",fo(AR,24),W-88)):
    text(44,250+i*34,ln,fo(AR,24),MUT)

# features
feats=[
 ("Ship & track everything in one place","Create a delivery in seconds or upload a whole batch from a spreadsheet; watch each parcel live — picked up, in transit, delivered, with real ETAs."),
 ("Door-to-door, including the hard-to-reach","Full corridor coverage out to remote towns like Deep River, Pembroke and the valley — the addresses couriers won't quote."),
 ("Secure delivery for medical goods","Every parcel carries a 4-digit delivery code and handle-with-care handling — proof it reached the right person."),
 ("Your brand, not ours","Tracking pages and the SMS/email updates your clients receive carry Conval-Aid's logo and colours."),
 ("Automatic paperwork","Shipping labels, bills of lading and receipts generate themselves — no manual forms."),
 ("Notifications + satisfaction follow-up","Clients are texted/emailed at each step, with an optional post-delivery survey."),
 ("Business billing","Monthly plan or pay-as-you-go, consolidated invoicing on net terms, and volume pricing as you grow."),
]
y=368
nf=fo(AB,26); df=fo(AR,22); numf=fo(AB,24)
for i,(h,desc) in enumerate(feats):
    d.ellipse([m(44),m(y+2),m(44+34),m(y+36)],fill=MAG); text(54,y+6,str(i+1),numf,WHITE)
    text(98,y,h,nf,INK)
    dl=wrap(desc,df,W-150)
    for j,ln in enumerate(dl): text(98,y+34+j*30,ln,df,MUT)
    y+= 34 + len(dl)*30 + 20

# login box
by=y+6
bh=250
rr([40,by,W-40,by+bh],16,fill=PINK_BG,outline=PINK_BD,width=2)
text(66,by+22,"LOG IN  —  business.kolis.ca",fo(AB,30),MAG)
steps=[
 "1.  Go to business.kolis.ca",
 "2.  Enter your email (med@conval-aid.com)",
 "3.  Tap “Email me a code” — a 6-digit code arrives by email",
 "4.  Enter the code. No password to remember.",
]
for i,s in enumerate(steps): text(70,by+72+i*38,s,fo(AR,24),INK)
text(70,by+72+4*38+2,"We'll set up your Conval-Aid workspace so the dashboard is ready when you sign in.",fo(AR,20),MUT)

# footer
fy=by+bh+26
seg2=W/len(ACC)
for i,c in enumerate(ACC): d.rectangle([m(i*seg2),m(fy),m((i+1)*seg2),m(fy+6)],fill=c)
d.rectangle([0,m(fy+6),m(W),m(H)],fill=BLACK)
t1="Thomas Derick Shalo  ·  Concord Express Co Inc. · Kolis"
text((W-tw(t1,fo(AB,26))/K)/2,fy+28,t1,fo(AB,26),WHITE)
t2="613-862-2639  ·  kolis.ca  ·  concordexpress.ca"
text((W-tw(t2,fo(AR,22))/K)/2,fy+64,t2,fo(AR,22),(200,200,206))

im=im.crop((0,0,m(W),m(fy+6+104)))
im.save(OUT("kolis_business_onepager.png"))
im.convert("RGB").save(OUT("Kolis-for-Business-ConvalAid.pdf"),"PDF",resolution=200.0)
print("saved",im.size)
