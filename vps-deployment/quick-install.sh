#!/bin/bash

# Быстрая установка FemboyChat на VPS
# Запустите: curl -sSL https://raw.githubusercontent.com/kultik1337/FemboyChat/main/vps-deployment/quick-install.sh | sudo bash

set -e

echo "========================================="
echo "🚀 FemboyChat Quick Install"
echo "========================================="
echo ""

# Проверка root
if [[ $EUID -ne 0 ]]; then
   echo "❌ Запустите с sudo"
   exit 1
fi

# Создание директории
mkdir -p /opt/femboychat
cd /opt/femboychat

# Загрузка файлов
echo "📥 Загрузка конфигурационных файлов..."
wget -q https://raw.githubusercontent.com/kultik1337/FemboyChat/main/vps-deployment/docker-compose.yml
wget -q https://raw.githubusercontent.com/kultik1337/FemboyChat/main/vps-deployment/nginx.conf
wget -q https://raw.githubusercontent.com/kultik1337/FemboyChat/main/vps-deployment/init.sql
wget -q https://raw.githubusercontent.com/kultik1337/FemboyChat/main/vps-deployment/install.sh
chmod +x install.sh

echo "✅ Файлы загружены"
echo ""
echo "📋 Следующий шаг:"
echo "./install.sh"
echo ""
