# UFW Web Manager 1.1

Ubuntu Server 的轻量级 UFW Web 管理端。

## 1.1 修复内容

本版本针对 1.0 的两个主要问题进行了修复：

### NoNewPrivileges

systemd 不再设置：

```text
NoNewPrivileges=true
```

因为 Web 程序需要通过 `sudo -n /usr/sbin/ufw` 从 `ufwweb` 用户切换到 root。开启 NoNewPrivileges 会直接导致：

```text
sudo: The "no new privileges" flag is set
```

### user.rules not writable

Web 用户永远不直接写 `/etc/ufw/user.rules`。

架构为：

```text
Browser
  ↓
Flask (ufwweb)
  ↓
sudo -n /usr/sbin/ufw
  ↓
root
  ↓
/etc/ufw/*
```

安装脚本还会确保：

```text
/etc/ufw              root:root 755
/etc/ufw/user.rules   root:root 640
/etc/ufw/user6.rules  root:root 640
```

## 安装

```bash
unzip ufw-web-manager-1.1.zip
cd ufw-web-manager-1.1
sudo bash install.sh
```

安装过程会交互式询问监听地址和端口：

```text
程序监听地址：
  1) 127.0.0.1  仅本机访问，推荐配合 SSH 隧道 (默认)
  2) 0.0.0.0    局域网/公网可访问 —— 当前版本没有登录认证，
                 任何能连到该端口的人都可以直接操作防火墙！
请选择 [1/2] (默认 1):
请输入监听端口 (1-65535，默认 8099):
```

选择 `0.0.0.0` 时需要额外输入 `yes` 二次确认。

也可以通过环境变量跳过交互，用于无人值守安装：

```bash
sudo UFW_WEB_HOST=0.0.0.0 UFW_WEB_PORT=9000 bash install.sh
```

安装完成后会打印真实可访问的地址：

- 选择 `127.0.0.1` 时，打印 `http://127.0.0.1:<端口>/`，并给出 SSH 隧道命令示例。
- 选择 `0.0.0.0` 时，自动探测并打印本机所有局域网/公网 IPv4 地址，例如：

```text
=== UFW Web Manager 1.1 安装完成 ===
已监听所有网络接口，可通过以下地址访问（请注意安全，当前无登录认证）：
  http://127.0.0.1:8099/   (本机)
  http://192.168.1.10:8099/   (真实IP)
```

远程服务器推荐使用 SSH 隧道：

```bash
ssh -L 8088:127.0.0.1:8088 user@SERVER_IP
```

浏览器打开：

```text
http://127.0.0.1:8088/
```

## 检查服务

```bash
sudo systemctl status ufw-web-manager
```

检查 Web 用户是否可以执行 UFW：

```bash
sudo -u ufwweb sudo -n /usr/sbin/ufw status
```

检查 sudoers：

```bash
sudo visudo -cf /etc/sudoers.d/ufw-web-manager
```

## 卸载

```bash
sudo bash uninstall.sh
```

卸载不会删除 UFW，也不会删除现有 UFW 防火墙规则。

## SSH 防锁

远程服务器启用 UFW 前：

```bash
sudo ufw allow 22/tcp
sudo ufw enable
```

如果 SSH 使用其他端口，请先允许实际 SSH 端口。

## 安全建议

默认只监听 127.0.0.1:8099（安装时可交互选择）。

如果需要局域网或公网访问，建议：

- Nginx/Caddy 反向代理
- HTTPS
- 登录认证
- TOTP/WebAuthn
- VPN 或 IP 白名单
- 操作审计

当前 1.1 仍然没有内置用户认证，不建议直接暴露到公网。
