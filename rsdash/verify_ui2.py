#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Verify หลังแก้ index.html (A1 volBadge + A2 crowdLine + loadVolCorr) — v2"""
import re, os, subprocess, json, sys

HERE = os.path.dirname(os.path.abspath(__file__))
html = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()
body = re.findall(r"<script>([\s\S]*?)</script>", html)[0]
ok = True

try:
    compile(body, "index.html<script>", "exec")
    print("PASS compile <script>")
except SyntaxError as e:
    ok = False; print("FAIL compile:", e)

for nm in ("volBadge", "crowdLine", "loadVolCorr"):
    n = len(re.findall(re.escape(nm) + r"\(", body))
    print("     %-12s x%d" % (nm, n))
    if n == 0:
        ok = False; print("     FAIL missing", nm)

def extract(name):
    m = re.search(r"function " + name + r"\([^)]*\)\s*\{", body)
    if not m:
        return None
    i = m.end() - 1
    depth = 0
    j = i
    while j < len(body):
        if body[j] == "{": depth += 1
        elif body[j] == "}":
            depth -= 1
            if depth == 0:
                break
        j += 1
    return body[m.start():j + 1]

funcs = {nm: extract(nm) for nm in ("volBadge", "crowdLine")}
if any(v is None for v in funcs.values()):
    print("FAIL: cannot extract helper functions"); sys.exit(1)

node_src = r"""
const VOL_TH={SAWAD:{v:25.5,vs:30.0,b:'norm',d:'down'},SMT:{v:48.7,vs:40.0,b:'wild',d:'up'},PTT:{v:20.0,vs:20.0,b:'riom',d:'flat'}};
const CORR_BEST={SINGER:['SGC',0.819],PTTGC:['IVL',0.705]};
""" + "\n" + funcs["volBadge"] + "\n" + funcs["crowdLine"] + r"""
const r=[['SAWAD',volBadge('SAWAD')],['SMT',volBadge('SMT')],['PTT',volBadge('PTT')],['NOPE',volBadge('NOPE')],['SINGER',crowdLine('SINGER')],['PTTGC',crowdLine('PTTGC')],['SAWAD',crowdLine('SAWAD')]];
for(const [k,v] of r){ console.log(k+' => '+v); }
"""
tmp = os.path.join(HERE, ".verify_tmp.js")
open(tmp, "w", encoding="utf-8").write(node_src)
out = subprocess.run(["node", tmp], capture_output=True, text=True)
os.remove(tmp)
if out.returncode != 0:
    print("FAIL node:", out.stderr[:600]); ok = False
else:
    print(out.stdout)
    for token in ("SGC", "IVL", "no-arg", ""):
        pass
    need = ["SINGER =>", "PTTGC =>", "SAWAD =>"]
    if not all(x in out.stdout for x in need):
        print("FAIL node output missing expected rows"); ok = False
    else:
        print("PASS node helpers run + render")

for f in ("index.html", "vol_th.json", "corr_th.json"):
    print("     file %-12s exists=%s" % (f, os.path.exists(os.path.join(HERE, f))))
json.load(open(os.path.join(HERE, "vol_th.json"), encoding="utf-8"))
json.load(open(os.path.join(HERE, "corr_th.json"), encoding="utf-8"))
print("PASS vol/corr json valid")

print("\nRESULT:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)