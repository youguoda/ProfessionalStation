#!/usr/bin/env bash
# 把马力装进工作本的 Hermes：skill + profile 各就各位。
#
# 在**工作本**上跑（Hermes 所在的那台），不是在服务器上。
#   bash deploy/hermes/install.sh
#
# 行为对齐 model-test-agents/scripts/install-hermes-{skills,profiles}.sh：
#   skill   → ~/.hermes/skills/<namespace>/professional-station
#   profile → ~/.hermes/profiles/mali/
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_HOME="${HERMES_HOME:-${HOME}/.hermes}"
NAMESPACE="${PS_SKILL_NAMESPACE:-personal}"
SKILL_DEST="${HERMES_HOME}/skills/${NAMESPACE}"
PROFILE_DEST="${HERMES_HOME}/profiles/mali"

echo "Hermes home : ${HERMES_HOME}"
echo "Skill       : ${SKILL_DEST}/professional-station"
echo "Profile     : ${PROFILE_DEST}"
echo

# ---- skill ----
mkdir -p "${SKILL_DEST}"
rm -rf "${SKILL_DEST}/professional-station"
cp -a "${HERE}/skills/professional-station" "${SKILL_DEST}/professional-station"
chmod +x "${SKILL_DEST}/professional-station/scripts/pstation"
echo "  ✓ skill 已安装"

# ---- profile ----
if command -v hermes >/dev/null 2>&1; then
  if hermes profile list 2>/dev/null | grep -q "^mali\b"; then
    echo "  · profile mali 已存在"
  else
    echo "  · 创建 profile mali"
    hermes profile create mali --no-bundled-skills 2>/dev/null \
      || hermes profile create mali 2>/dev/null || true
  fi
  hermes profile describe mali \
    --text "马力——个人任务系统的损友兼教练，基于 ProfessionalStation 的真实数据给建议" \
    2>/dev/null || true
else
  echo "  ! 没找到 hermes CLI：只铺文件，profile 需要你装好 Hermes 后再跑一次本脚本"
fi

mkdir -p "${PROFILE_DEST}"
for f in SOUL.md profile.yaml config.yaml; do
  cp -a "${HERE}/profiles/mali/${f}" "${PROFILE_DEST}/${f}"
done
echo "  ✓ profile bundle 已部署"

# ---- 凭据自检 ----
echo
if [[ -z "${PS_AUTH_USER:-}" || -z "${PS_AUTH_PASS:-}" ]]; then
  cat <<'TIP'
  ! 还没设置 PS 的凭据。加到你的 ~/.zshrc（或 ~/.bashrc）：

      export PS_BASE_URL=http://10.112.9.44:3000
      export PS_AUTH_USER=<用户名>
      export PS_AUTH_PASS=<密码>

    然后 source 一下，再跑：
      "SKILLDIR"/scripts/pstation doctor
TIP
  echo "    （SKILLDIR = ${SKILL_DEST}/professional-station）"
else
  echo "  验证连通性…"
  "${SKILL_DEST}/professional-station/scripts/pstation" doctor || true
fi

cat <<EOS

装好了。这么用：

  hermes -p mali chat -s ${NAMESPACE}/professional-station

EOS
