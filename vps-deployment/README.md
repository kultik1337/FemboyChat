# 🚀 Развертывание FemboyChat на VPS

Инструкция по установке FemboyChat на выделенный сервер (VPS).

## 📋 Что понадобится

- **VPS:** Ubuntu 24.04, 2TB диск
- **IP:** 31.192.106.238
- **Домен:** (опционально, но рекомендуется для SSL)
- **Доступ:** SSH root доступ

## 🔧 Автоматическая установка

### Шаг 1: Подключитесь к серверу

```bash
ssh root@31.192.106.238
```

### Шаг 2: Загрузите и запустите скрипт установки

```bash
wget https://raw.githubusercontent.com/kultik1337/FemboyChat/main/vps-deployment/install.sh
chmod +x install.sh
sudo ./install.sh
```

Скрипт автоматически:
- ✅ Обновит систему
- ✅ Установит Docker и Docker Compose
- ✅ Настроит Firewall (UFW)
- ✅ Создаст директорию `/opt/femboychat`
- ✅ Сгенерирует секретные ключи
- ✅ Создаст файл `.env`

### Шаг 3: Загрузите конфигурационные файлы

```bash
cd /opt/femboychat

# Скачайте файлы с GitHub
wget https://raw.githubusercontent.com/kultik1337/FemboyChat/main/vps-deployment/docker-compose.yml
wget https://raw.githubusercontent.com/kultik1337/FemboyChat/main/vps-deployment/nginx.conf
wget https://raw.githubusercontent.com/kultik1337/FemboyChat/main/vps-deployment/init.sql
```

### Шаг 4: Соберите и загрузите frontend

На локальной машине:

```bash
cd FemboyChat
npm run build

# Скопируйте dist на сервер
scp -r dist/* root@31.192.106.238:/opt/femboychat/frontend/
```

Или на сервере клонируйте репозиторий и соберите:

```bash
cd /opt/femboychat
git clone https://github.com/kultik1337/FemboyChat.git temp
cd temp
npm install
npm run build
cp -r dist/* /opt/femboychat/frontend/
cd ..
rm -rf temp
```

### Шаг 5: Запустите проект

```bash
cd /opt/femboychat
docker-compose up -d
```

### Шаг 6: Проверьте статус

```bash
# Проверьте что все контейнеры запущены
docker-compose ps

# Посмотрите логи
docker-compose logs -f

# Проверьте nginx
docker-compose logs nginx

# Проверьте базу данных
docker-compose logs postgres
```

## 🌐 Настройка домена

### DNS записи

Добавьте эти записи в настройках вашего домена:

```
Тип    Имя    Значение           TTL
A      @      31.192.106.238     3600
A      www    31.192.106.238     3600
```

### SSL сертификат (Let's Encrypt)

Когда домен будет готов и DNS пропишется:

```bash
# Обновите .env файл
nano /opt/femboychat/.env
# Замените:
# SITE_URL=https://ваш-домен.ru
# API_EXTERNAL_URL=https://ваш-домен.ru

# Получите SSL сертификат
docker-compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  -d ваш-домен.ru \
  -d www.ваш-домен.ru \
  --email ваш-email@example.com \
  --agree-tos \
  --no-eff-email

# Раскомментируйте HTTPS блок в nginx.conf
nano /opt/femboychat/nginx.conf

# Перезапустите nginx
docker-compose restart nginx
```

## 📊 Управление

### Просмотр логов

```bash
# Все сервисы
docker-compose logs -f

# Конкретный сервис
docker-compose logs -f nginx
docker-compose logs -f postgres
docker-compose logs -f realtime
```

### Остановка

```bash
docker-compose down
```

### Перезапуск

```bash
docker-compose restart
```

### Обновление

```bash
cd /opt/femboychat

# Обновите код
git pull  # если клонировали репозиторий
# или загрузите новый dist/

# Пересоберите frontend
docker-compose restart nginx
```

## 🗄️ Резервное копирование

### База данных

```bash
# Создать backup
docker-compose exec postgres pg_dump -U postgres femboychat > backup_$(date +%Y%m%d).sql

# Восстановить из backup
docker-compose exec -T postgres psql -U postgres femboychat < backup_20240101.sql
```

### Файлы пользователей

```bash
# Backup storage
tar -czf storage_backup_$(date +%Y%m%d).tar.gz \
  /var/lib/docker/volumes/femboychat_storage_data/_data/

# Восстановить
tar -xzf storage_backup_20240101.tar.gz -C /
```

## 🔍 Мониторинг

### Проверка использования ресурсов

```bash
# Использование дисков
df -h

# Docker volumes
docker system df -v

# Использование памяти контейнерами
docker stats
```

### Здоровье сервисов

```bash
# Проверка что БД жива
docker-compose exec postgres pg_isready -U postgres

# Проверка что API работает
curl http://localhost:3000/
```

## ⚙️ Настройка SMTP (Email)

Для отправки email-подтверждений обновите в `/opt/femboychat/.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=ваш-email@gmail.com
SMTP_PASS=ваш-app-password
```

### Gmail

1. Включите двухфакторную аутентификацию
2. Создайте App Password: https://myaccount.google.com/apppasswords
3. Используйте этот пароль в `SMTP_PASS`

### Yandex

```env
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=587
SMTP_USER=ваш-email@yandex.ru
SMTP_PASS=ваш-пароль
```

## 🔒 Безопасность

### Firewall

```bash
# Проверьте UFW
sudo ufw status

# Должны быть открыты:
# 22/tcp (SSH)
# 80/tcp (HTTP)
# 443/tcp (HTTPS)
```

### Обновления системы

```bash
# Регулярно обновляйте систему
sudo apt update && sudo apt upgrade -y

# Обновляйте Docker образы
cd /opt/femboychat
docker-compose pull
docker-compose up -d
```

## 🐛 Решение проблем

### Контейнеры не запускаются

```bash
# Проверьте логи
docker-compose logs

# Проверьте что порты свободны
sudo netstat -tulpn | grep -E ':(80|443|3000|4000|5000|5432|9999)'

# Пересоздайте контейнеры
docker-compose down
docker-compose up -d --force-recreate
```

### База данных не подключается

```bash
# Проверьте что postgres запущен
docker-compose ps postgres

# Проверьте логи
docker-compose logs postgres

# Подключитесь к БД вручную
docker-compose exec postgres psql -U postgres -d femboychat
```

### Nginx показывает 502

```bash
# Проверьте что все backend сервисы запущены
docker-compose ps

# Проверьте nginx конфиг
docker-compose exec nginx nginx -t

# Перезапустите nginx
docker-compose restart nginx
```

## 📈 Производительность

### PostgreSQL оптимизация

Для 2TB диска можно увеличить лимиты в `docker-compose.yml`:

```yaml
postgres:
  environment:
    - POSTGRES_SHARED_BUFFERS=2GB
    - POSTGRES_EFFECTIVE_CACHE_SIZE=6GB
    - POSTGRES_MAX_CONNECTIONS=200
```

### Очистка старых файлов

```bash
# Удалить неиспользуемые образы
docker system prune -a

# Удалить старые логи
docker-compose logs --tail=1000 > logs_backup.txt
# затем truncate логи через docker
```

## 🎉 Готово!

Ваш FemboyChat должен быть доступен по адресу:
- **HTTP:** http://31.192.106.238
- **HTTPS (после настройки домена):** https://ваш-домен.ru

## 📞 Поддержка

Если возникли проблемы:
1. Проверьте логи: `docker-compose logs -f`
2. Откройте issue на GitHub
3. Проверьте что все порты открыты в Firewall
