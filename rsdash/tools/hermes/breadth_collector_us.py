#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Wrapper: Breadth collector สำหรับตลาดอเมริกา (job cron ส่ง argument ไม่ได้ → ใช้ wrapper set env)

cron ของ Hermes รับ "script" เป็น path เดียว ไม่มี field สำหรับ argument
→ job "Breadth collector (US)" เดิมรัน breadth_collector.py เปล่า ๆ = ได้ market default 'thailand'
   (เก็บไทยซ้ำทุกเช้า, US ไม่เคยเก็บ) — เจอ 8 ต.ค. 2026
"""
import os, runpy, sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ["BREADTH_MARKET"] = "america"
sys.argv = ["breadth_collector.py", "america"]
runpy.run_path(os.path.join(HERE, "breadth_collector.py"), run_name="__main__")
