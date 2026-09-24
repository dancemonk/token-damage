# Illustrative list prices per 1M tokens: (input, cache_write, cache_read, output)
P = {"opus": (5, 6.25, 0.50, 25), "sonnet": (3, 3.75, 0.30, 15), "haiku": (1, 1.25, 0.10, 5)}
def price(comp, mix):
    out = {}
    for fam, share in mix.items():
        i, w, r, o = P[fam]
        c = {k: v*share for k, v in comp.items()}
        cost = (c["input"]*i + c["write"]*w + c["read"]*r + c["output"]*o)/1e6
        read_saving = c["read"]*(i - r)/1e6          # vs paying fresh input
        write_premium = c["write"]*(w - i)/1e6       # extra paid to create cache
        tok = sum(c.values())
        out[fam] = dict(cost=cost, saving=read_saving - write_premium, tokens=tok)
    return out
def report(name, comp, mix, words, guess=None):
    tot = sum(comp.values())
    r = price(comp, mix)
    cost = sum(v["cost"] for v in r.values()); save = sum(v["saving"] for v in r.values())
    kwh = tot/1e9*53; lo = tot/1e9*22; hi = tot/1e9*103
    print(f"== {name}")
    print(f" total {tot:,.0f}  read-side {comp['input']+comp['write']+comp['read']:,.0f}  output {comp['output']:,.0f}")
    print(f" cache-read share of total {comp['read']/tot*100:.2f}%  output share {comp['output']/tot*100:.2f}%")
    for f, v in r.items(): print(f"  {f:7s} {v['tokens']/1e6:8.1f}M  ${v['cost']:,.2f}")
    print(f" list ${cost:,.2f}  net cache saving ${save:,.2f}  without cache ${cost+save:,.2f}")
    print(f" kWh central {kwh:.2f} range {lo:.3f}-{hi:.3f}  fridge-months {lo/33:.2f}-{hi/33:.2f}  phone charges {lo/0.015:.0f}-{hi/0.015:.0f}")
    print(f" tokens per typed word {tot/words:,.0f}  gatsbys/word {tot/words/62600:.2f}")
    if guess: print(f" guess {guess:,} -> off by {tot/guess:.1f}x")
    return tot, cost
m_tot, m_cost = report("MONTH", dict(input=2.1e6, write=38.4e6, read=1138.2e6, output=4.7e6), dict(opus=.71, sonnet=.24, haiku=.05), 14690, 20_000_000)
report("NIGHT sep17", dict(input=0.31e6, write=5.1e6, read=181.0e6, output=0.612e6), dict(opus=.86, sonnet=.10, haiku=.04), 1960)
report("LIGHT sep22", dict(input=0.012e6, write=0.252e6, read=2.676e6, output=0.0184e6), dict(sonnet=1.0), 212)
tot = 1183.4e6
print("RAM-X", tot/6e13*0.95*0.42)
print("plan multiple", m_cost/200)
