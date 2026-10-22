#!/bin/sh
# Server konteyneri: bazani yangilash (migratsiyalar), admin akkauntini tayyorlash, serverni ishga tushirish.
set -e
cd /app/apps/server
./node_modules/.bin/prisma migrate deploy
# Admin (ADMIN_EMAIL/ADMIN_PASSWORD) har ishga tushishda yangilanadi — favqulodda kirish uchun.
if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then node dist/seed.js; fi
exec node dist/index.js
