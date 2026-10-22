#!/bin/sh
# Kunlik SQLite zaxirasi (backup konteynerida cron orqali). Onlayn, izchil nusxa: sqlite3 .backup.
# Saqlash muddati: BACKUP_KEEP_DAYS (standart 14).
set -e
ts=$(date +%Y-%m-%d_%H%M)
sqlite3 /data/kodim.db ".backup '/backups/kodim-$ts.db'"
gzip -f "/backups/kodim-$ts.db"
find /backups -name 'kodim-*.db.gz' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
echo "zaxira: /backups/kodim-$ts.db.gz"
