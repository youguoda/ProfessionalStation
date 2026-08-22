# 内网部署

公司服务器作为**唯一真相源**，VPN 回内网访问。前提：不再有第二个实例——
这个产品没有同步，两个 `db.json` 会让周回顾的结算台从根上失效。

## 一次性

```bash
# 1. 探 AI 端点（决定要不要 AI_JSON_MODE=0）
AI_BASE_URL=http://ai.corp.local:8000/v1 AI_API_KEY=xxx \
AI_MODEL=Qwen2.5-72B-Instruct ./deploy/preflight-ai.sh

# 2. 装 + 构建
sudo mkdir -p /opt/professional-station /var/lib/professional-station
sudo chown -R guoda /opt/professional-station /var/lib/professional-station
cd /opt/professional-station
npm ci && npm run build

# 3. 密钥（权限收紧，里面有内网 AI key）
sudo install -m 600 /dev/null /etc/professional-station.env
sudo vim /etc/professional-station.env      # 填 preflight 打印的那几行

# 4. 常驻
sudo cp deploy/pstation.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now pstation

# 5. 门
sudo htpasswd -c /etc/nginx/.htpasswd guoda
sudo cp deploy/nginx.conf /etc/nginx/conf.d/pstation.conf
sudo nginx -t && sudo systemctl reload nginx

# 6. 备份
sudo crontab -l | { cat; echo "0 19 * * 1-5 /opt/professional-station/deploy/backup.sh"; } | sudo crontab -
```

## 迁移现有数据

笔记本上已有真实数据，别从空库开始：

```bash
scp .data/db.json server:/tmp/
ssh server 'sudo systemctl stop pstation \
  && sudo install -o guoda -m 644 /tmp/db.json /var/lib/professional-station/db.json \
  && sudo systemctl start pstation'
```

搬完**把笔记本那套停掉**，否则你会在两个库里各写一半。

## 更新代码

```bash
git pull && npm ci && npm run build && sudo systemctl restart pstation
```

`.data/` 和 `.env*` 都在 `.gitignore` 里，`git pull` 不会碰数据。

## 排查

| 症状 | 看这里 |
|---|---|
| 502 | `systemctl status pstation` / `journalctl -u pstation -n 50` |
| 马力回复不打字，整段蹦出来 | Nginx 的 `proxy_buffering off` 没生效 |
| AI 报 HTTP 400 | 内网端点不认 `response_format` → `AI_JSON_MODE=0` |
| AI 报连接错误、证书相关 | service 里放开 `NODE_EXTRA_CA_CERTS` |
| 收不到到期提醒 | 必须走 `https://`，Notification API 要安全上下文 |
| 数据回滚 | `systemctl stop` → 覆盖 `db.json` → `start` |
