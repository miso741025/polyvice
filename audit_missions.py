import re,sys
def load(p): return open(p).read()
ms=load('src/missions.js'); hs=load('src/heat.js')
starts=dict(re.findall(r"(\w+): '(\w+)'", ms[ms.index('const STARTS = {'):ms.index('const CHAIN')]))
chain=set(re.findall(r"'(\w+)'", ms[ms.index('const CHAIN'):ms.index('async function offer')].split('\n')[0]))
def order(src, key):
    out=[]
    for m in re.finditer(r"missions: \[([^\]]+)\]", src[src.index(key):]):
        out+= [x.strip() for x in m.group(1).split(',')]
    return out
vice=order(ms,'const EPISODES = [')
heat=order(hs,'export const HEAT = [')
KEY=re.compile(r"\b(phone|say|therapy|reach|intoBing|place|asOther|asNeil|asHanna|asCrew|homeAsTony|cut|titleCard|enter|roomScene|bingRoom|fade|walkOut|stayInBing|intoWard|downToLobby|rounds|shake|wantCar|intoHome|leave|passed|setPlayer|playing|runDown|tail)\(g(?:, ([^,\n\)]{0,46}))?")
def body(src,name):
    m=re.search(r"\n(?:export )?async function "+name+r"\(g\) \{", src)
    if not m: return None
    i=m.end(); j=src.find("\n}\n", i)
    return src[i:j]
def summary(src,name):
    b=body(src,name)
    if b is None: return None
    calls=[(m.group(1),(m.group(2) or '').strip()) for m in KEY.finditer(b)]
    calls=[c for c in calls if c[0] not in('fade',)]
    f=lambda c: c[0]+('('+c[1][:40]+')' if c[1] and c[0] in('reach','place','enter','walkOut','asOther','intoBing','roomScene','titleCard','cut') else '')
    return ' > '.join(f(c) for c in calls[:7]), ' > '.join(f(c) for c in calls[-5:])
for label,src,lst in (('VICE',ms,vice),('HEAT',hs,heat)):
    print('=====',label)
    for n,name in enumerate(lst):
        s=summary(src,name) or summary(ms,name) or summary(hs,name)
        hub='CHAIN' if name in chain else starts.get(name,'home')
        print(f"{n+1:2} {name} [hub {hub}]\n     START: {s[0] if s else '?'}\n     END:   {s[1] if s else '?'}")
