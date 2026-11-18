#!/usr/bin/env python3
"""Kolis-branded December capacity sheet for Conval-Aid.
Same shell as the October one-pager (kolis_business_onepager.py) — magenta header,
KOLIS chip, rainbow rule, numbered points, pink box, black footer — with the
holiday-corridor content instead of the onboarding content. PIL, no Chrome."""
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
text(252,104,"Concord Express Co Inc. — Holiday corridor capacity",fo(AB,22),(255,215,230))
seg=W/len(ACC)
for i,c in enumerate(ACC): d.rectangle([m(i*seg),m(150),m((i+1)*seg),m(157)],fill=c)

# title
text(44,190,"December on the Ottawa Valley run",fo(AB,40),INK)
intro=("December is when couriers thin out on the valley corridor and quotes get slow — "
       "exactly where Conval-Aid ships. We are reserving capacity on that run for business "
       "accounts, booked ahead instead of quoted on the day.")
for i,ln in enumerate(wrap(intro,fo(AR,24),W-88)):
    text(44,250+i*34,ln,fo(AR,24),MUT)

feats=[
 ("Slots held in your name","Reserved space on the Ottawa → Pembroke → Deep River run for the weeks of 8, 15 and 22 December. Tell us the volume; we hold it."),
 ("The same handling as KL-3339","Door-to-door, handle-with-care, and a 4-digit code given at the door — your October delivery to Deep River ran exactly this way."),
 ("Several shipments at once","Send us the list and we create them together, or upload a spreadsheet from the dashboard. One tracking page per client, in Conval-Aid's name."),
 ("Clients kept informed","Each recipient is texted and emailed as the parcel moves, so your office is not fielding “where is it” calls through the holidays."),
 ("One invoice, not many","Everything in December lands on a single month-end invoice on net terms, with the paperwork generated for you."),
]
y=368
nf=fo(AB,26); df=fo(AR,22); numf=fo(AB,24)
for i,(h,desc) in enumerate(feats):
    d.ellipse([m(44),m(y+2),m(44+34),m(y+36)],fill=MAG); text(54,y+6,str(i+1),numf,WHITE)
    text(98,y,h,nf,INK)
    dl=wrap(desc,df,W-150)
    for j,ln in enumerate(dl): text(98,y+34+j*30,ln,df,MUT)
    y+= 34 + len(dl)*30 + 20

# booking box
by=y+6
bh=232
rr([40,by,W-40,by+bh],16,fill=PINK_BG,outline=PINK_BD,width=2)
text(66,by+22,"TO HOLD YOUR SLOTS",fo(AB,30),MAG)
steps=[
 "1.  Reply with the weeks you expect to ship, and roughly how many",
 "2.  We reserve the space against Conval-Aid and confirm by email",
 "3.  Create each delivery at business.kolis.ca, or send us the list",
 "4.  Nothing is owed until a parcel actually ships",
]
for i,s in enumerate(steps): text(70,by+72+i*38,s,fo(AR,24),INK)

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
im.save(OUT("Kolis-ConvalAid-December.png"))
im.convert("RGB").save(OUT("Kolis-ConvalAid-December.pdf"),"PDF",resolution=200.0)
print("saved", im.size)
