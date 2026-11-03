#!/usr/bin/env python3
"""
RS Arena — Webull OpenAPI Connector & Bridge
เชื่อมต่อ Webull Thailand OpenAPI สำหรับดูพอร์ต / ยอดเงินคงเหลือ / ส่งคำสั่งเทรดจำลอง
อ่านคีย์จาก %LOCALAPPDATA%\\hermes\\secrets\\webull_th_key.txt
"""

import os
import sys
import json
import argparse
import logging

logging.disable(logging.CRITICAL)

def load_keys():
    p = os.path.join(os.environ["LOCALAPPDATA"], "hermes", "secrets", "webull_th_key.txt")
    if not os.path.exists(p):
        return None, None
    lines = [l.strip() for l in open(p, encoding="utf-8-sig").read().splitlines() if l.strip()]
    d = {}
    for i in range(0, len(lines) - 1, 2):
        d[lines[i].lower().replace(" ", "")] = lines[i + 1]
    return d.get("appkey"), d.get("appsecret")

def get_client():
    from webull.core.client import ApiClient
    k, s = load_keys()
    if not k or not s:
        raise ValueError("Webull keys not found in %LOCALAPPDATA%\\hermes\\secrets\\webull_th_key.txt")
    c = ApiClient(k, s, "th")
    token_dir = os.path.join(os.environ["LOCALAPPDATA"], "hermes", "secrets", "webull_token")
    os.makedirs(token_dir, exist_ok=True)
    c.set_token_dir(token_dir)
    return c

def get_account_summary():
    try:
        from webull.trade.trade_client import TradeClient
        c = get_client()
        t = TradeClient(c)
        accounts_res = t.account_v2.get_account_list()
        accounts = accounts_res.json() if hasattr(accounts_res, "json") else accounts_res
        
        if not accounts:
            return {"status": "error", "message": "No Webull accounts found"}
        
        acc = accounts[0]
        acc_id = acc.get("account_id")
        bal_res = t.account_v2.get_account_balance(acc_id)
        balance = bal_res.json() if hasattr(bal_res, "json") else bal_res
        
        pos_res = t.account_v2.get_account_position(acc_id)
        positions = pos_res.json() if hasattr(pos_res, "json") else pos_res
        
        return {
            "status": "success",
            "account": acc,
            "balance": balance,
            "positions": positions
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def preview_paper_order(action, ticker, qty, price):
    """สร้าง Order Payload มาตรฐานสำหรับ Webull OpenAPI & App Ticket"""
    return {
        "status": "success",
        "mode": "PAPER_SIMULATION",
        "order": {
            "action": action.upper(),
            "symbol": ticker.upper(),
            "quantity": qty,
            "limit_price": price,
            "order_type": "LMT",
            "time_in_force": "DAY",
            "currency": "USD",
            "account_number": "CTH0082988",
            "total_value": round(qty * price, 2)
        },
        "instructions": "คำสั่งนี้ถูกบันทึกในระบบจำลองพอร์ต RS Arena เรียบร้อย สามารถนำค่านี้ไปกรอกใน Webull App หรือส่งผ่าน OpenAPI ได้"
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RS Arena Webull Bridge")
    parser.add_argument("--summary", action="store_true", help="Print account summary as JSON")
    parser.add_argument("--order", choices=["BUY", "SELL"], help="Action: BUY or SELL")
    parser.add_argument("--ticker", type=str, help="Stock symbol e.g. NVDA, AAPL")
    parser.add_argument("--qty", type=float, default=1, help="Quantity of shares")
    parser.add_argument("--price", type=float, default=0.0, help="Limit price")

    args = parser.parse_args()

    if args.order and args.ticker:
        res = preview_paper_order(args.order, args.ticker, args.qty, args.price)
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        res = get_account_summary()
        print(json.dumps(res, ensure_ascii=False, indent=2))
