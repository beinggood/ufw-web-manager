# UFW Web Manager

轻量级的 Ubuntu/Debian UFW（Uncomplicated Firewall）Web 管理面板。用浏览器代替记忆 `ufw` 命令行参数，适合远程 Linux 服务器的日常防火墙管理。

![Python](https://img.shields.io/badge/python-3-blue)
![Flask](https://img.shields.io/badge/flask-web-lightgrey)
![Platform](https://img.shields.io/badge/platform-Ubuntu%20%2F%20Debian-orange)
![License](https://img.shields.io/badge/license-MIT-green)

![ufw_screenshot](https://raw.githubusercontent.com/beinggood/ufw-web-manager/refs/heads/main/ufw.png)

## 功能特性

- 📊 **状态总览** — 查看 UFW 当前是否启用、详细状态（`ufw status verbose`）
- 🔛 **一键启用 / 禁用** UFW
- 🛡️ **默认策略配置** — 分别设置入站 / 出站 / 转发的默认动作（allow / deny / reject）
- ➕ **添加规则** — 支持动作（allow/deny/reject/limit）、方向、端口（单端口 / 端口段 / 端口列表）、协议（tcp/udp）、来源与目标地址、备注
- 📋 **规则列表** — 查看当前所有编号规则
- 🗑️ **删除规则** — 按编号删除，自动重新编号
- 🔁 **重载防火墙**（`ufw reload`）
- 🌐 **安装时交互式配置** — 安装脚本会询问监听地址（`127.0.0.1` 仅本机 / `0.0.0.0` 局域网或公网）与监听端口，并在安装完成后打印真实可访问的 IP + 端口
- 🔒 **最小权限设计** — Web 进程以非特权用户运行，仅通过 `sudo -n /usr/sbin/ufw` 这一条命令获得 root 权限，无法执行任意 shell 命令

## 架构

```
Browser
  ↓
Flask (以非特权用户 ufwweb 运行)
  ↓
sudo -n /usr/sbin/ufw   (sudoers 白名单，仅允许这一条命令)
  ↓
root
  ↓
/etc/ufw/*
```

- Web 应用用户**不会**直接读写 `/etc/ufw/user.rules` 等文件，所有变更都通过官方 `ufw` 命令完成，避免规则文件被写坏。
- systemd 服务**不启用** `NoNewPrivileges=true`（该选项会导致 `sudo` 提权失败并报 `The "no new privileges" flag is set`）。
- sudoers 规则精确限定到单个可执行文件路径，不给予 shell、systemctl、apt 等任何额外权限。

## 快速开始

### 环境要求

- Ubuntu / Debian（使用 `apt-get`、`systemd`）
- root 或 sudo 权限

### 安装

```bash
unzip ufw-web-manager-1.1.zip
cd ufw-web-manager-1.1
sudo bash install.sh
```

安装过程中会交互式询问：

```text
程序监听地址：
  1) 127.0.0.1  仅本机访问，推荐配合 SSH 隧道 (默认)
  2) 0.0.0.0    局域网/公网可访问 —— 当前版本没有登录认证，
                 任何能连到该端口的人都可以直接操作防火墙！
请选择 [1/2] (默认 1):
请输入监听端口 (1-65535，默认 8099):
```

选择 `0.0.0.0` 时需要额外输入 `yes` 二次确认。

也可以通过环境变量跳过交互，用于无人值守 / 自动化安装：

```bash
sudo UFW_WEB_HOST=0.0.0.0 UFW_WEB_PORT=9000 bash install.sh
```

安装完成后会自动打印真实可访问地址：

```text
=== UFW Web Manager 1.1 安装完成 ===
已监听所有网络接口，可通过以下地址访问（请注意安全，当前无登录认证）：
  http://127.0.0.1:8099/   (本机)
  http://192.168.1.10:8099/   (真实IP)
```

### 访问

- 本机部署：直接打开 `http://127.0.0.1:<端口>/`
- 远程服务器（推荐）：使用 SSH 隧道，无需对公网暴露端口

  ```bash
  ssh -L 8099:127.0.0.1:8099 user@SERVER_IP
  ```

  然后浏览器打开 `http://127.0.0.1:8099/`

### 卸载

```bash
sudo bash uninstall.sh
```

卸载不会删除 UFW 本身，也不会删除已有的防火墙规则。

## 运维检查

```bash
# 查看服务状态
sudo systemctl status ufw-web-manager

# 确认 Web 用户可以无密码执行 ufw
sudo -u ufwweb sudo -n /usr/sbin/ufw status

# 校验 sudoers 语法
sudo visudo -cf /etc/sudoers.d/ufw-web-manager
```

## 使用 SSH 时的防锁提醒

在远程服务器上首次启用 UFW 前，**务必先放行 SSH 端口**，否则会把自己锁在外面：

```bash
sudo ufw allow 22/tcp
sudo ufw enable
```

如果 SSH 使用非默认端口，请替换为实际端口号。

## 安全建议

当前版本**没有内置登录认证**，请勿直接暴露到公网。推荐做法：

- 默认监听 `127.0.0.1`，配合 SSH 隧道使用
- 如需局域网/公网访问，请在前面加一层：
  - Nginx / Caddy 反向代理
  - HTTPS
  - 登录认证（Basic Auth / OAuth 等）
  - TOTP / WebAuthn 二次验证
  - VPN 或 IP 白名单
  - 操作审计日志

## 目录结构

```
.
├── app.py                     # Flask 主程序
├── templates/index.html       # 前端页面
├── static/app.js               # 前端逻辑
├── static/style.css            # 样式
├── requirements.txt            # Python 依赖
├── sudoers                     # sudoers 规则（安装时写入 /etc/sudoers.d/）
├── ufw-web-manager.service     # systemd unit（安装时渲染真实监听地址/端口）
├── install.sh                  # 交互式安装脚本
└── uninstall.sh                # 卸载脚本
```

## License

MIT
