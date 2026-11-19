#!/usr/bin/env bash
# Levanta Ares React en http://127.0.0.1:8081/spa/
set -e
cd "$(dirname "$0")"
if [ ! -d frontend/node_modules ]; then (cd frontend && npm install); fi
(cd frontend && npm run build)
pkill -f "php -S 127.0.0.1:8081" 2>/dev/null || true
cd backend
exec ~/.local/php-static/php -S 127.0.0.1:8081 -t public server.php
