#!/usr/bin/env bash
# 上线前把内网 AI 端点探一遍——三件事全过才配 key，别靠上线后猜。
#
#   AI_BASE_URL=http://ai.corp.local:8000/v1 \
#   AI_API_KEY=xxx AI_MODEL=Qwen2.5-72B-Instruct \
#   ./deploy/preflight-ai.sh

set -uo pipefail

BASE="${AI_BASE_URL:?请先设置 AI_BASE_URL}"
KEY="${AI_API_KEY:?请先设置 AI_API_KEY}"
MODEL="${AI_MODEL:?请先设置 AI_MODEL}"
URL="${BASE%/}/chat/completions"

echo "端点：$URL"
echo "模型：$MODEL"
echo

req() {
  curl -sS -o /tmp/pf-body -w '%{http_code}' -m 60 \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $KEY" \
    -d "$1" "$URL" 2>/tmp/pf-err
}

# ── 1. 基本连通 ────────────────────────────────────────────────
echo "[1/3] 基本调用（马力的流式回复、教练的一句话都依赖它）"
code=$(req '{"model":"'"$MODEL"'","messages":[{"role":"user","content":"只回复两个字：收到"}],"temperature":0.2}')
if [ "$code" != "200" ]; then
  echo "  ✗ HTTP $code"
  sed -n '1,5p' /tmp/pf-body /tmp/pf-err 2>/dev/null
  echo
  echo "  先解决这个：模型名是否正确？端点是否要带 /v1？自签证书？"
  exit 1
fi
grep -q '"content"' /tmp/pf-body \
  && echo "  ✓ 通" \
  || { echo "  ✗ 200 但结构不是 OpenAI 格式"; cat /tmp/pf-body; exit 1; }

# ── 2. response_format ────────────────────────────────────────
echo "[2/3] response_format: json_object（任务拆分 / 操作建议 / 记忆提炼依赖它）"
code=$(req '{"model":"'"$MODEL"'","messages":[{"role":"user","content":"输出 JSON：{\"ok\":true}"}],"temperature":0.2,"response_format":{"type":"json_object"}}')
if [ "$code" = "200" ]; then
  JSON_MODE=1
  echo "  ✓ 支持 —— .env 不用管 AI_JSON_MODE"
else
  JSON_MODE=0
  echo "  ! HTTP $code —— 不支持"
  echo "    → .env 里加一行：AI_JSON_MODE=0"
  echo "    → 改由提示词要求 JSON，parseJsonLoose 兜底，功能不丢"
fi

# ── 3. 流式 ───────────────────────────────────────────────────
echo "[3/3] stream: true（马力的打字机效果）"
chunks=$(curl -sS -N -m 60 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"model":"'"$MODEL"'","messages":[{"role":"user","content":"从 1 数到 10"}],"stream":true}' \
  "$URL" 2>/dev/null | grep -c '^data:')
if [ "$chunks" -gt 1 ]; then
  echo "  ✓ 收到 $chunks 个 data: 分片"
else
  echo "  ! 只收到 $chunks 个分片 —— 打字机会退化成「等半天一次性蹦出来」"
  echo "    不影响正确性，聊天仍可用"
fi

echo
echo "──────────────────────────────"
echo "写进 /etc/professional-station.env："
echo "  AI_BASE_URL=${BASE%/}"
echo "  AI_MODEL=$MODEL"
echo "  AI_API_KEY=<你的内网 key>"
[ "$JSON_MODE" = "0" ] && echo "  AI_JSON_MODE=0"
