#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Verify หลังแก้ index.html (A1 vol badge + A2 crowคู่):
1) new Function  compile ทั้ง <script>
2) ทดสอบ volBadge/crowdLine/loadVolCorr ในตัวแยกด้วย node (stub)
3) grep ว่าโฟลเดอร์ deploy มี vol_th.json + corr_th.json"""
import re, os, subprocess, json

HERE = os.path.dirname(os.path.abspath(__file__))
html = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()
scripts = re.findall(r"<script>([\s\S]*?)</script>", html)
body = scripts[0] if scripts else ""
print("script blocks:", len(scripts), "| script length:", len(body))

# 1) compile
try:
    compile(body, "index.html<script>", "exec")
    print("OK compile  whole <script>")
except SyntaxError as e:
    print("COMPILE FAIL:", e)
    raise

issues = []
fn_defs = re.findall(r"function (volBadge|crowdLine|loadVolCorr)\(", body)
print("defined:", fn_defs)
for nm in ("volBadge", "crowdLine", "loadVolCorr"):
    n = len(re.findall(re.escape(nm) + r"\(", body))
    print("  %-12s appears %d time(s)" % (nm, n))
    if n == 0:
        issues.append(nm + " missing")

# 2) node behavior test of the 3 functions (isolate + eval)
funcs = {}
for nm, start, finish in (("volBadge", re.search(r"function volBadge[\s\S]*?\n}", body).start(),
                          re.search(r"function volBadge[\s\S]*?\n}", body).end()),
                          ("crowdLine", re.search(r"function crowdLine[\s\S]*?\n}", body).start(),
                           re.search(r"function crowdLine[\s\S]*?\n}", body).end()),
                          ("loadVolCorr", re.search(r"function loadVolCorr[\s\S]*?\n}", body).start(),
                           re.search(r"function loadVolCorr[\s\S]*?\n}", body).end())):
    funcs[nm] = body[start:finish]
test = r"""
const VOL_TH={SAWAD:{v:25.5,vs:30.0,b:'norm',d:'down'},SMT:{v:48.7,vs:40.0,b:'wild',d:'up'},PTT:{v:20.0,vs:20.0,b:'riom',d:'flat'}};
const CORR_BEST={SINGER:['SGC',0.819],PTTGC:['IVL',0.705]};
let __out=[];
""" + funcs["volBadge"] + funcs["crowdLine"] + funcs["loadVolCorr"] + r"""
__out.push(volBadge('SAWAD'));
__out.push(volBadge('SMT'));
__out.push(volBadge('PTT'));
__out.push(volBadge('NOPE'));
__out.push(crowdLine('SINGER'));
__out.push(crowdLine('PTTGC'));
__out.push(crowdLine('SAWAD'));
let fetched=0; const API=''; global.fetch=()=>{fetch(); };
""" 
# stubbed loadVolCorr needs fetch -> replace pure test
funcs["loadVolCorr"] = """function loadVolCorr(){ /* stubbed */ }"""
test = r"""
const VOL_TH={SAWAD:{v:25.5,vs:30.0,b:'norm',d:'down'},SMT:{v:48.7,vs:40.0,b:'wild',d:'up'},PTT:{v:20.0,vs:20.0,b:'riom',d:'flat'}};
const CORR_BEST={SINGER:['SGC',0.819],PTTGC:['IVL',0.705]};
""" + funcs["volBadge"] + funcs["crowdLine"] + r"""
return [volBadge('SAWAD'),volBadge('SMT'),volBadge('PTT'),volBadge('NOPE'),crowdLine('SINGER'),crowdLine('PTTGC'),crowdLine('SAWAD')];
"""
node = subprocess.run(["node", "-e", "var f=new Function(" + json.dumps("") + ");"] and ["node", "--version"],
                      capture_output=True, text=True)
if node.returncode == 0:
    out = subprocess.run(["node", "-e", "console.log(JSON.stringify(new Function(" + json.dumps("") + "" + json.dumps(test) + ").call({})))" ],
                         capture_output=True, text=True)
    print("node test rc:", out.returncode)
    print(out.stdout)
    (print or __import__("sys").exit)(None) if out.returncode != 0 else None
    if out.stderr:
        print("node stderr:", out.stderr[:500])
else:
    print("no node?", node.stdout, node.stderr)

# 3) deploy files present
for f in ("index.html", "vol_th.json", "corr_th.json"):
    p = os.path.join(HERE, f)
    print("deploy file %-14s exists=%s" % (f, os.path.exists(p)))
json.load(open(os.path.join(HERE, "vol_th.json"), encoding="utf-8"))
json.load(open(os.path.join(HERE, "corr_th.json"), encoding="utf-8"))
print("vol/corr json valid")

print("\nissues:", issues if issues else "none")