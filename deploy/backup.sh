#!/usr/bin/env bash
# 全部身家就是一个 20KB 的 JSON。公司服务器你不完全掌控——
# 重装、迁移、离职，任何一个都能让它消失。
#
#   sudo crontab -e
#   0 19 * * 1-5 /opt/professional-station/deploy/backup.sh

set -euo pipefail

SRC="${DATA_DIR:-/var/lib/professional-station}/db.json"
DEST="${BACKUP_DIR:-/var/backups/professional-station}"
KEEP="${KEEP_DAYS:-90}"

[ -f "$SRC" ] || { echo "找不到 $SRC" >&2; exit 1; }

mkdir -p "$DEST"
cp "$SRC" "$DEST/db-$(date +%F).json"

# 保留最近 N 天
find "$DEST" -name 'db-*.json' -mtime "+$KEEP" -delete

echo "已备份 → $DEST/db-$(date +%F).json"
