#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/ufw-web-manager"
SERVICE="ufw-web-manager"
APP_USER="ufwweb"

[[ $EUID -eq 0 ]] || { echo "请使用 sudo/root 运行。"; exit 1; }

command -v apt-get >/dev/null || { echo "此安装程序面向 Ubuntu/Debian 系统。"; exit 1; }

# ---------------------------------------------------------------------------
# 交互式选择监听地址和端口
# 支持通过环境变量 UFW_WEB_HOST / UFW_WEB_PORT 预设值以便无人值守安装
# （例如 sudo UFW_WEB_HOST=0.0.0.0 UFW_WEB_PORT=8099 bash install.sh）。
# 若未预设且脚本运行在非交互终端（无 stdin），则直接使用默认值。
# ---------------------------------------------------------------------------
LISTEN_HOST="${UFW_WEB_HOST:-}"
LISTEN_PORT="${UFW_WEB_PORT:-}"

is_valid_port() {
    [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

if [[ -z "$LISTEN_HOST" ]] && [[ -t 0 ]]; then
    echo "程序监听地址："
    echo "  1) 127.0.0.1  仅本机访问，推荐配合 SSH 隧道 (默认)"
    echo "  2) 0.0.0.0    局域网/公网可访问 —— 当前版本没有登录认证，"
    echo "                 任何能连到该端口的人都可以直接操作防火墙！"
    read -r -p "请选择 [1/2] (默认 1): " host_choice
    case "${host_choice:-1}" in
        1|"") LISTEN_HOST="127.0.0.1" ;;
        2)
            LISTEN_HOST="0.0.0.0"
            read -r -p "确认要监听 0.0.0.0，允许非本机连接？请输入 yes 确认: " confirm
            if [[ "$confirm" != "yes" ]]; then
                echo "已取消，改为使用 127.0.0.1。"
                LISTEN_HOST="127.0.0.1"
            fi
            ;;
        *) echo "无效选择，使用默认值 127.0.0.1。"; LISTEN_HOST="127.0.0.1" ;;
    esac
elif [[ -z "$LISTEN_HOST" ]]; then
    LISTEN_HOST="127.0.0.1"
fi

if [[ -z "$LISTEN_PORT" ]] && [[ -t 0 ]]; then
    read -r -p "请输入监听端口 (1-65535，默认 8099): " port_input
    LISTEN_PORT="${port_input:-8099}"
    if ! is_valid_port "$LISTEN_PORT"; then
        echo "端口无效，使用默认值 8099。"
        LISTEN_PORT="8099"
    fi
elif [[ -z "$LISTEN_PORT" ]]; then
    LISTEN_PORT="8099"
elif ! is_valid_port "$LISTEN_PORT"; then
    echo "环境变量 UFW_WEB_PORT=$LISTEN_PORT 无效，使用默认值 8099。"
    LISTEN_PORT="8099"
fi

echo
echo "将使用监听地址: $LISTEN_HOST  端口: $LISTEN_PORT"
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

sed -e "s/__UFW_WEB_HOST__/${LISTEN_HOST}/" \
    -e "s/__UFW_WEB_PORT__/${LISTEN_PORT}/" \
    ufw-web-manager.service > /tmp/ufw-web-manager.service.rendered
install -m 0644 /tmp/ufw-web-manager.service.rendered /etc/systemd/system/ufw-web-manager.service
rm -f /tmp/ufw-web-manager.service.rendered

systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

# 获取本机真实 IPv4 地址（排除回环），用于安装完成后展示可访问的真实地址
get_real_ips() {
    if command -v ip >/dev/null 2>&1; then
        ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1
    elif command -v hostname >/dev/null 2>&1; then
        hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^127\.' | grep -v '^$'
    fi
}

echo
echo "=== UFW Web Manager 1.1 安装完成 ==="
if [[ "$LISTEN_HOST" == "0.0.0.0" ]]; then
    echo "已监听所有网络接口，可通过以下地址访问（请注意安全，当前无登录认证）："
    echo "  http://127.0.0.1:${LISTEN_PORT}/   (本机)"
    mapfile -t real_ips < <(get_real_ips)
    if [[ ${#real_ips[@]} -eq 0 ]]; then
        echo "  未能自动探测到本机局域网/公网 IP，请自行执行 'ip addr' 查看。"
    else
        for ip_addr in "${real_ips[@]}"; do
            echo "  http://${ip_addr}:${LISTEN_PORT}/   (真实IP)"
        done
    fi
else
    echo "地址: http://${LISTEN_HOST}:${LISTEN_PORT}/"
    echo
    echo "如需从其他机器访问，推荐使用 SSH 隧道："
    echo "  ssh -L ${LISTEN_PORT}:127.0.0.1:${LISTEN_PORT} user@本机真实IP"
fi
echo
echo "验证 sudo 权限:"
sudo -u "$APP_USER" sudo -n /usr/sbin/ufw status || true
echo
systemctl --no-pager --full status "$SERVICE" || true
