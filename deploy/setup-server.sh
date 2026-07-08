#!/bin/bash
# ============================================================
# MyNotes 阿里云服务器一键初始化脚本
#
# 适用系统: Ubuntu 20.04+ / Debian 11+ / CentOS 8+ / Alinux 3
# 使用方式: 在服务器上执行
#   curl -fsSL <raw_url> | bash
#   或
#   bash deploy/setup-server.sh
# ============================================================
set -euo pipefail

echo "========================================="
echo "  MyNotes 服务器环境初始化"
echo "========================================="

# ------ 1. 检测操作系统 ------
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    echo "[1/5] 检测到操作系统: $PRETTY_NAME"
else
    echo "[错误] 无法识别操作系统"
    exit 1
fi

# ------ 2. 安装 Docker ------
if command -v docker &> /dev/null; then
    echo "[2/5] Docker 已安装: $(docker --version)"
else
    echo "[2/5] 正在安装 Docker..."
    case $OS in
        ubuntu|debian)
            apt-get update -qq
            apt-get install -y -qq ca-certificates curl gnupg
            install -m 0755 -d /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            chmod a+r /etc/apt/keyrings/docker.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
            apt-get update -qq
            apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
            ;;
        centos|rhel|alinux|aliyunlinux)
            yum install -y yum-utils
            yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
            yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
            ;;
        *)
            echo "[错误] 不支持的操作系统: $OS，请手动安装 Docker"
            exit 1
            ;;
    esac
    systemctl enable docker
    systemctl start docker
    echo "  ✓ Docker 安装完成: $(docker --version)"
fi

# ------ 3. 检查 Docker Compose 插件 ------
if docker compose version &> /dev/null; then
    echo "[3/5] Docker Compose 已就绪: $(docker compose version --short)"
else
    echo "[错误] Docker Compose 插件未安装，请运行:"
    echo "  apt-get install docker-compose-plugin  (Ubuntu/Debian)"
    echo "  yum install docker-compose-plugin       (CentOS/Alinux)"
    exit 1
fi

# ------ 4. 配置防火墙（开放 80 端口） ------
echo "[4/5] 配置防火墙..."
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp 2>/dev/null || true
    ufw allow 443/tcp 2>/dev/null || true
    echo "  ✓ ufw 已放行 80/443"
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=80/tcp 2>/dev/null || true
    firewall-cmd --permanent --add-port=443/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    echo "  ✓ firewalld 已放行 80/443"
else
    echo "  ⚠ 未检测到防火墙工具，请确保安全组已放行 80/443 端口"
fi

# ------ 5. 创建项目目录 ------
APP_DIR="/opt/mynotes"
echo "[5/5] 准备项目目录: $APP_DIR"
mkdir -p "$APP_DIR"

echo ""
echo "========================================="
echo "  ✅ 服务器环境初始化完成！"
echo "========================================="
echo ""
echo "接下来请执行:"
echo "  1. 将代码上传到 $APP_DIR"
echo "  2. cd $APP_DIR"
echo "  3. cp .env.production.example .env.production"
echo "  4. 编辑 .env.production 填入密钥"
echo "  5. bash deploy/deploy.sh"
echo ""
