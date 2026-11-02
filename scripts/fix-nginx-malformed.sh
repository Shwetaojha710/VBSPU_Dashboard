#!/usr/bin/env bash
# Fixes "HTTP/0.9" / browser "malformed response" for vbspu-dashboard.
# Run ON THE SERVER as ubuntu (with sudo):
#   bash scripts/fix-nginx-malformed.sh
# Or paste the body into an SSH session from /tmp after uploading.

set -euo pipefail

SITE_NAME="vbspu-dashboard.demoquaeretech.in"
SITE_AVAILABLE="/etc/nginx/sites-available/${SITE_NAME}"
SITE_ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"
NGINX_CONF="/etc/nginx/nginx.conf"
APP_ROOT="/var/www/html/${SITE_NAME}"
API_PORT="5060"

echo "==> 1) Raise server_names_hash (many vhosts on this box)"
sudo cp -a "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"

if grep -qE '^\s*server_names_hash_max_size' "$NGINX_CONF"; then
  sudo sed -i -E 's/^\s*server_names_hash_max_size.*/    server_names_hash_max_size 4096;/' "$NGINX_CONF"
else
  sudo sed -i -E 's/^(http \{)/\1\n    server_names_hash_max_size 4096;/' "$NGINX_CONF"
fi

if grep -qE '^\s*server_names_hash_bucket_size' "$NGINX_CONF"; then
  sudo sed -i -E 's/^\s*server_names_hash_bucket_size.*/    server_names_hash_bucket_size 128;/' "$NGINX_CONF"
else
  sudo sed -i -E 's/^(http \{)/\1\n    server_names_hash_bucket_size 128;/' "$NGINX_CONF"
fi

echo "==> 2) Write nginx site (API -> 127.0.0.1:${API_PORT})"
sudo tee "$SITE_AVAILABLE" > /dev/null <<EOF
server {
    listen 80;
    server_name ${SITE_NAME};

    root ${APP_ROOT}/frontend;
    index index.html;

    client_max_body_size 20M;

    add_header X-Served-By vbspu-dashboard always;

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT}/api/;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

sudo ln -sfn "$SITE_AVAILABLE" "$SITE_ENABLED"

echo "==> 3) Align CORS with HTTP (browser is on http://)"
ENV_FILE="${APP_ROOT}/backend/.env"
if [[ -f "$ENV_FILE" ]]; then
  if grep -qE '^CORS_ORIGIN=' "$ENV_FILE"; then
    sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=http://vbspu-dashboard.demoquaeretech.in|' "$ENV_FILE"
  else
    echo 'CORS_ORIGIN=http://vbspu-dashboard.demoquaeretech.in' >> "$ENV_FILE"
  fi
  if grep -qE '^PORT=' "$ENV_FILE"; then
    sed -i "s|^PORT=.*|PORT=${API_PORT}|" "$ENV_FILE"
  else
    echo "PORT=${API_PORT}" >> "$ENV_FILE"
  fi
  echo "    PORT/CORS in .env:"
  grep -E '^(PORT|CORS_ORIGIN)=' "$ENV_FILE" || true
else
  echo "    WARN: ${ENV_FILE} missing — create it before login will work"
fi

echo "==> 4) nginx test + reload"
sudo nginx -t
sudo systemctl reload nginx

echo "==> 5) Ensure API on ${API_PORT}"
if ! ss -tlnp | grep -q ":${API_PORT} "; then
  echo "    API not listening — starting pm2 vbspu-api"
  cd "${APP_ROOT}/backend"
  pm2 delete vbspu-api 2>/dev/null || true
  pm2 start ecosystem.config.cjs
  pm2 save
else
  pm2 restart vbspu-api --update-env 2>/dev/null || true
fi

sleep 2

echo "==> 6) Verify"
echo "--- local ---"
curl -sS -D - "http://127.0.0.1:${API_PORT}/api/health" -o /tmp/vbspu-local.json | head -20
echo
cat /tmp/vbspu-local.json
echo
echo "--- via Host header on :80 ---"
curl -sS -D - "http://127.0.0.1/api/health" -H "Host: ${SITE_NAME}" -o /tmp/vbspu-host.json | head -30
echo
cat /tmp/vbspu-host.json
echo
echo "--- via public hostname ---"
set +e
curl -sS --http1.1 -D - "http://${SITE_NAME}/api/health" -o /tmp/vbspu-domain.json
DOMAIN_RC=$?
set -e
echo
if [[ $DOMAIN_RC -ne 0 ]]; then
  echo "FAIL: domain curl exit ${DOMAIN_RC} (still HTTP/0.9 or DNS?). Check server_names_hash warnings:"
  sudo nginx -t 2>&1 | grep -i hash || true
  exit 1
fi
head -c 300 /tmp/vbspu-domain.json; echo
if grep -qi 'X-Served-By: vbspu-dashboard' /tmp/vbspu-domain.json /dev/null 2>/dev/null; then
  :
fi
# Headers were written to stdout above when using -D -
echo
echo "OK if you saw HTTP/1.1 200 and JSON status ok, plus X-Served-By: vbspu-dashboard"
echo "Then hard-refresh the browser (Ctrl+Shift+R) and try login again."
