#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/ufw-web-manager"
SERVICE="ufw-web-manager"
APP_USER="ufwweb"

[[ $EUID -eq 0 ]] || { echo "请使用 sudo/root 运行。"; exit 1; }

command -v apt-get >/dev/null || { echo "此安装程序面向 Ubuntu/Debian 系统。"; exit 1; }

# ---------------------------------------------------------------------------
# 交互式配置：监听端口 / 监听地址
# 可通过环境变量 UFW_WEB_PORT / UFW_WEB_LISTEN_ALL 跳过交互（用于自动化安装）。
# ---------------------------------------------------------------------------
DEFAULT_PORT=8088

if [[ -n "${UFW_WEB_PORT:-}" ]]; then
  APP_PORT="$UFW_WEB_PORT"
elif [[ -t 0 ]]; then
  read -rp "请输入程序监听端口 [默认 ${DEFAULT_PORT}]: " APP_PORT
  APP_PORT="${APP_PORT:-$DEFAULT_PORT}"
else
  APP_PORT="$DEFAULT_PORT"
fi

if ! [[ "$APP_PORT" =~ ^[0-9]+$ ]] || (( APP_PORT < 1 || APP_PORT > 65535 )); then
  echo "无效端口: $APP_PORT，使用默认值 ${DEFAULT_PORT}。"
  APP_PORT="$DEFAULT_PORT"
fi

if [[ -n "${UFW_WEB_LISTEN_ALL:-}" ]]; then
  case "${UFW_WEB_LISTEN_ALL,,}" in
    1|y|yes|true) LISTEN_ALL=1 ;;
    *) LISTEN_ALL=0 ;;
  esac
elif [[ -t 0 ]]; then
  read -rp "是否监听所有网络接口 0.0.0.0（否则仅监听 127.0.0.1，更安全）？[y/N]: " ans
  case "${ans,,}" in
    y|yes) LISTEN_ALL=1 ;;
    *) LISTEN_ALL=0 ;;
  esac
else
  LISTEN_ALL=0
fi

if [[ "$LISTEN_ALL" -eq 1 ]]; then
  APP_HOST="0.0.0.0"
else
  APP_HOST="127.0.0.1"
fi

echo
echo "将使用配置: 监听地址=${APP_HOST}  端口=${APP_PORT}"
if [[ "$LISTEN_ALL" -eq 1 ]]; then
  echo "警告: 监听 0.0.0.0 会将管理界面暴露到所有网络接口，请确保已设置好访问控制/防火墙规则。"
fi
echo

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-venv sudo ufw

id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin "$APP_USER"

rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -r app.py templates static requirements.txt "$INSTALL_DIR/"

python3 -m venv "$INSTALL_DIR/.venv"
"$INSTALL_DIR/.venv/bin/pip" install --upgrade pip
"$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

install -m 0440 sudoers /etc/sudoers.d/ufw-web-manager
visudo -cf /etc/sudoers.d/ufw-web-manager

# UFW itself and its rule files must remain owned by root.
chown root:root /etc/ufw
chmod 755 /etc/ufw
if [[ -e /etc/ufw/user.rules ]]; then
  chown root:root /etc/ufw/user.rules
  chmod 640 /etc/ufw/user.rules
fi
if [[ -e /etc/ufw/user6.rules ]]; then
  chown root:root /etc/ufw/user6.rules
  chmod 640 /etc/ufw/user6.rules
fi

chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR"

sed -e "s/^Environment=UFW_WEB_HOST=.*/Environment=UFW_WEB_HOST=${APP_HOST}/" \
    -e "s/^Environment=UFW_WEB_PORT=.*/Environment=UFW_WEB_PORT=${APP_PORT}/" \
    ufw-web-manager.service > /tmp/ufw-web-manager.service.rendered
install -m 0644 /tmp/ufw-web-manager.service.rendered /etc/systemd/system/ufw-web-manager.service
rm -f /tmp/ufw-web-manager.service.rendered

systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

echo
echo "=== UFW Web Manager 1.1 安装完成 ==="
if [[ "$APP_HOST" == "0.0.0.0" ]]; then
  echo "地址: http://<本机IP>:${APP_PORT}/  (已监听所有接口)"
else
  echo "地址: http://127.0.0.1:${APP_PORT}/"
fi
echo
echo "验证 sudo 权限:"
sudo -u "$APP_USER" sudo -n /usr/sbin/ufw status || true
echo
systemctl --no-pager --full status "$SERVICE" || true
