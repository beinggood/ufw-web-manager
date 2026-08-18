# UFW Web Manager 1.1

Ubuntu Server 的轻量级 UFW 防火墙 Web 管理端。

## 功能特性

- 🔥 启用 / 禁用 UFW，查看状态与已生效规则
- ➕ 添加 / 删除防火墙规则（支持来源/目标地址、端口、协议、动作、备注）
- ⚙️ 设置默认策略（incoming / outgoing / routed）
- 🔒 Web 进程本身不具备 root 权限，仅通过 `sudo -n /usr/sbin/ufw` 这一条白名单命令间接操作防火墙

## 架构与安全设计

```text
Browser
  ↓
Flask (以非特权用户 ufwweb 运行)
  ↓
sudo -n /usr/sbin/ufw   ← sudoers 白名单，仅此一条命令
  ↓
root
  ↓
/etc/ufw/*
```

要点：

- systemd 服务**不**设置 `NoNewPrivileges=true`，因为该选项会阻止 `sudo` 提权，导致所有防火墙操作失败
- `ufwweb` 用户通过 `/etc/sudoers.d/ufw-web-manager` 被严格限制为**只能**以 root 身份运行 `/usr/sbin/ufw`，不能执行 bash、sh、systemctl、apt 等任何其他命令
- Web 用户永远不直接读写 `/etc/ufw/user.rules`，规则文件始终归 root 所有：

  ```text
  /etc/ufw              root:root 755
  /etc/ufw/user.rules   root:root 640
  /etc/ufw/user6.rules  root:root 640
  ```

## 环境要求

- Ubuntu / Debian（依赖 `apt-get`）
- root / sudo 权限

## 安装

```bash
unzip ufw-web-manager.zip
cd ufw-web-manager
sudo bash install.sh
```

安装脚本会自动安装所需依赖（`python3`、`python3-venv`、`ufw` 等），并交互式询问：

1. **监听端口**（默认 `8088`）
2. **是否监听所有网络接口 `0.0.0.0`**（默认否，仅监听 `127.0.0.1`，更安全；选是会将管理界面暴露到所有网卡，脚本会打印提醒）

也可以通过环境变量跳过交互，用于自动化部署：

```bash
UFW_WEB_PORT=9000 UFW_WEB_LISTEN_ALL=yes sudo bash install.sh
```

安装完成后会打印实际访问地址。默认配置下：

```text
http://127.0.0.1:8088/
```

### 远程服务器访问建议

若安装时选择仅监听 `127.0.0.1`（推荐），可通过 SSH 隧道访问：

```bash
ssh -L 8088:127.0.0.1:8088 user@SERVER_IP
```

然后本地浏览器打开：

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

检查 sudoers 语法：

```bash
sudo visudo -cf /etc/sudoers.d/ufw-web-manager
```

## 卸载

```bash
sudo bash uninstall.sh
```

卸载会停止并移除服务、`ufwweb` 用户及安装目录，**不会**删除 UFW 本身及其现有防火墙规则。

## ⚠️ SSH 防锁提醒

远程服务器首次启用 UFW 前，务必先放行 SSH 端口，否则可能把自己锁在外面：

```bash
sudo ufw allow 22/tcp
sudo ufw enable
```

如果 SSH 使用非默认端口，请先放行实际使用的端口。

## 安全建议

- 默认仅监听 `127.0.0.1`，不建议直接改为监听 `0.0.0.0` 并暴露到公网
- 若确需局域网或公网访问，建议叠加：
  - Nginx / Caddy 反向代理
  - HTTPS
  - 登录认证（TOTP / WebAuthn）
  - VPN 或 IP 白名单
  - 操作审计日志
- 当前版本未内置用户认证，暴露到不受信任网络前请自行加固
