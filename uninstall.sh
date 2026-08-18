#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "请使用 sudo/root。"; exit 1; }
systemctl disable --now ufw-web-manager.service 2>/dev/null || true
rm -f /etc/systemd/system/ufw-web-manager.service /etc/sudoers.d/ufw-web-manager
systemctl daemon-reload
rm -rf /opt/ufw-web-manager
userdel ufwweb 2>/dev/null || true
echo "UFW Web Manager 已卸载；不会删除 UFW 本身及其防火墙规则。"
