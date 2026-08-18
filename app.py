#!/usr/bin/env python3
import os, re, subprocess
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
HOST = os.environ.get("UFW_WEB_HOST", "127.0.0.1")
PORT = int(os.environ.get("UFW_WEB_PORT", "8099"))
UFW = "/usr/sbin/ufw"
SUDO = "/usr/bin/sudo"

# All firewall operations go through sudo -n. The systemd service deliberately
# does NOT use NoNewPrivileges=true, because that would block sudo elevation.
def run_ufw(*args):
    try:
        p = subprocess.run(
            [SUDO, "-n", UFW, *args],
            capture_output=True, text=True, timeout=15, check=False
        )
        return {"ok": p.returncode == 0, "code": p.returncode,
                "stdout": p.stdout.strip(), "stderr": p.stderr.strip()}
    except Exception as e:
        return {"ok": False, "code": -1, "stdout": "", "stderr": str(e)}

def bad(msg, code=400):
    return jsonify({"ok": False, "stderr": msg, "stdout": "", "code": code}), code

@app.get("/")
def index():
    return render_template("index.html")

@app.get("/api/status")
def status():
    return jsonify(run_ufw("status", "verbose"))

@app.get("/api/rules")
def rules():
    return jsonify(run_ufw("status", "numbered"))

@app.post("/api/enable")
def enable():
    return jsonify(run_ufw("--force", "enable"))

@app.post("/api/disable")
def disable():
    return jsonify(run_ufw("disable"))

@app.post("/api/reload")
def reload_ufw():
    return jsonify(run_ufw("reload"))

@app.post("/api/default")
def default_policy():
    d = request.get_json(silent=True) or {}
    direction, policy = d.get("direction"), d.get("policy")
    if direction not in {"incoming", "outgoing", "routed"}:
        return bad("无效的策略方向")
    if policy not in {"allow", "deny", "reject"}:
        return bad("无效的策略")
    return jsonify(run_ufw("default", policy, direction))

def valid_host(s):
    if not s or s.lower() == "any": return True
    return len(s) <= 128 and bool(re.fullmatch(r"[0-9A-Fa-f:.\/]+", s))

def valid_port(s):
    return not s or bool(re.fullmatch(
        r"[0-9]{1,5}([,:][0-9]{1,5})?([/][A-Za-z0-9]+)?", s
    ))

@app.post("/api/rule")
def add_rule():
    d = request.get_json(silent=True) or {}
    action = d.get("action", "allow")
    direction = d.get("direction", "")
    proto = d.get("protocol", "")
    port = str(d.get("port", "")).strip()
    src = str(d.get("from", "any")).strip()
    dst = str(d.get("to", "any")).strip()
    comment = str(d.get("comment", "")).strip()

    if action not in {"allow", "deny", "reject", "limit"}:
        return bad("无效的动作")
    if direction not in {"", "in", "out"}:
        return bad("无效的方向")
    if proto not in {"", "tcp", "udp"}:
        return bad("无效的协议")
    if not valid_port(port):
        return bad("端口格式无效")
    if not valid_host(src) or not valid_host(dst):
        return bad("来源或目标地址格式无效")
    if len(comment) > 100 or "\n" in comment or "\r" in comment:
        return bad("备注无效")

    has_from = src.lower() != "any"
    has_to = dst.lower() != "any"

    args = [action]
    if direction: args.append(direction)

    if has_from or has_to:
        # ufw's "from ADDRESS ... to ADDRESS" form does not accept the
        # PORT/PROTO shorthand — protocol and port must be given as
        # separate "proto X" / "port N" keywords instead, or ufw fails
        # with "ERROR: Wrong number of arguments".
        if proto: args += ["proto", proto]
        args += ["from", src if has_from else "any"]
        args += ["to", dst if has_to else "any"]
        if port: args += ["port", port]
    else:
        if port:
            # protocol is explicitly appended only after validating both values.
            args.append(port + ("/" + proto if proto else ""))

    if comment: args += ["comment", comment]
    return jsonify(run_ufw(*args))

@app.post("/api/delete")
def delete_rule():
    d = request.get_json(silent=True) or {}
    n = str(d.get("number", "")).strip()
    if not re.fullmatch(r"[0-9]{1,4}", n):
        return bad("规则编号无效")
    # UFW prompts when deleting a numbered rule; --force makes the operation
    # deterministic for the Web UI.
    return jsonify(run_ufw("--force", "delete", n))

if __name__ == "__main__":
    app.run(host=HOST, port=PORT)
