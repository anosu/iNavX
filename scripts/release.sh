#!/usr/bin/env bash
# scripts/release.sh - 发版脚本
# 用法: bash scripts/release.sh [patch|minor|major]
# 默认 patch

set -euo pipefail

BUMP="${1:-patch}"
if [ "$BUMP" != "patch" ] && [ "$BUMP" != "minor" ] && [ "$BUMP" != "major" ]; then
  echo "无效参数: $BUMP (仅支持 patch / minor / major)"
  exit 1
fi

# 依赖检查
for cmd in git gh bun node go shellcheck python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "缺少依赖: $cmd"
    exit 1
  fi
done

# 切换到项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "当前目录不是 Git 仓库"
  exit 1
fi

# 工作区必须干净
if [ -n "$(git status --porcelain)" ]; then
  echo "工作区有未提交的改动，请先 commit 或 stash"
  git status --short
  exit 1
fi

# 读取当前版本
CURRENT="$(node -p "require('./package.json').version")"
echo "当前版本: v$CURRENT"

# 计算新版本
MAJOR="$(echo "$CURRENT" | cut -d. -f1)"
MINOR="$(echo "$CURRENT" | cut -d. -f2)"
PATCH="$(echo "$CURRENT" | cut -d. -f3)"

case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
TAG="v$NEW_VERSION"

echo "新版本: $TAG ($BUMP)"
echo ""
read -r -p "继续? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "已取消"
  exit 0
fi
echo ""

# 构建
echo "构建中..."
bun run check:full
echo "构建通过"
echo ""

# 更新 package.json
node -e "
var fs = require('fs');
var pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, '\t') + '\n');
"
echo "package.json -> $NEW_VERSION"

# commit + tag
git add package.json
git commit -m "chore: release $TAG"
git tag -a "$TAG" -m "release $TAG"
echo "已创建 tag: $TAG"

# 推送
echo "推送中..."
git push
git push origin "$TAG"
echo "推送完成"
echo ""

# changelog: 上一个 tag 到当前之间的 commit
PREV_TAG="$(git describe --tags --abbrev=0 "${TAG}^" 2>/dev/null || echo "")"
if [ -n "$PREV_TAG" ]; then
  CHANGELOG="$(git log "$PREV_TAG".."$TAG" --pretty=format:"- %s" --no-merges)"
  echo "自 $PREV_TAG 以来的提交:"
  echo "$CHANGELOG"
else
  CHANGELOG="首次发布"
fi
echo ""

# 打开 GitHub release 草稿页
echo "打开 GitHub Release 草稿页..."
gh release create "$TAG" \
  --title "$TAG" \
  --notes "$CHANGELOG" \
  --draft \
  --web

echo ""
echo "完成! 在浏览器中审查后点击 Publish release 即可发布。"
