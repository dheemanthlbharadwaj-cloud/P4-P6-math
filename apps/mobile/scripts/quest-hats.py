# Quest-reward hats: recolours of the artist's hats (run from apps/mobile). Replace the PNGs with real art any time.
import numpy as np, colorsys, math
from PIL import Image, ImageDraw
def hsv(im):
    a=np.asarray(im.convert("RGBA")).astype(float)/255; rgb=a[...,:3]
    mx=rgb.max(-1); mn=rgb.min(-1); d=mx-mn+1e-9
    r,g,b=rgb[...,0],rgb[...,1],rgb[...,2]
    h=np.where(mx==r,((g-b)/d)%6,np.where(mx==g,(b-r)/d+2,(r-g)/d+4))/6
    s=np.where(mx>0,(mx-mn)/(mx+1e-9),0); return a,h,s,mx
def to_rgb(h,s,v):
    i=np.floor(h*6)%6; f=h*6-np.floor(h*6); p=v*(1-s); q=v*(1-f*s); t=v*(1-(1-f)*s)
    r=np.choose(i.astype(int),[v,q,p,p,t,v]); g=np.choose(i.astype(int),[t,v,v,q,p,p]); b=np.choose(i.astype(int),[p,p,t,v,v,q])
    return np.stack([r,g,b],-1)
def recolor(src,dst,rule):
    a,h,s,v=hsv(Image.open(src)); h2,s2,v2=rule(h,s,v)
    out=np.concatenate([to_rgb(h2,s2,v2),a[...,3:]],-1)
    return Image.fromarray((np.clip(out,0,1)*255).astype(np.uint8),"RGBA")
def star(d,cx,cy,r,fill):
    pts=[(cx+(r if k%2==0 else r*0.45)*math.sin(k*math.pi/5), cy-(r if k%2==0 else r*0.45)*math.cos(k*math.pi/5)) for k in range(10)]
    d.polygon(pts,fill=fill)
U="assets/ui/"
# Golden cap: blues -> gold, keep relative lightness
blue=lambda h,s: (h>0.5)&(h<0.75)&(s>0.2)
im=recolor(U+"hat-cap.png",None,lambda h,s,v:(np.where(blue(h,s),0.12,h),np.where(blue(h,s),np.clip(s*1.6,0,0.95),s),np.where(blue(h,s),np.clip(v**1.8*1.05,0,1),v)))
d=ImageDraw.Draw(im); star(d,150,62,20,(255,255,255,255)); im.save(U+"hat-cap-gold.png")
# Royal crown: gold/orange -> royal purple, jewels kept
gold=lambda h,s: (h>0.05)&(h<0.16)&(s>0.3)
im=recolor(U+"hat-crown.png",None,lambda h,s,v:(np.where(gold(h,s),0.76,h),np.where(gold(h,s),0.62,s),np.where(gold(h,s),v*0.85,v)))
im.save(U+"hat-crown-royal.png")
# Star wizard: blues -> midnight navy, purple band -> gold, extra gold stars
navy=lambda h,s: (h>0.5)&(h<0.7)&(s>0.3)
band=lambda h,s: (h>0.7)&(h<0.9)
im=recolor(U+"hat-wizard.png",None,lambda h,s,v:(np.where(navy(h,s),0.66,np.where(band(h,s),0.12,h)),np.where(navy(h,s),0.75,np.where(band(h,s),0.85,s)),np.where(navy(h,s),v*0.55,np.where(band(h,s),1.0,v))))
d=ImageDraw.Draw(im)
for cx,cy,r in [(152,58,7),(170,30,6),(100,64,6)]: star(d,cx,cy,r,(255,214,64,255))
im.save(U+"hat-wizard-star.png")
