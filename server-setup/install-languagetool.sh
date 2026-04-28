#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  install-languagetool.sh
#  Instala LanguageTool Server + Java + Nginx con autenticación en Ubuntu 22.04
#  Probado en Oracle Cloud Free Tier (ARM A1 / AMD Micro)
#
#  USO:
#    1. Conéctate a tu VM por SSH
#    2. Copia este archivo o pégalo con: nano install-languagetool.sh
#    3. chmod +x install-languagetool.sh && sudo ./install-languagetool.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -e  # Salir inmediatamente si hay un error

# ─── CONFIGURACIÓN — edita aquí antes de ejecutar ───────────────────────────
LT_VERSION="6.5"                       # Versión de LanguageTool a instalar
LT_PORT="8081"                         # Puerto interno (NO expuesto al exterior)
LT_HEAP="512m"                         # Memoria heap Java (conservador para 1 GB RAM)
NGINX_PORT="443"                       # Puerto HTTPS público
NGINX_HTTP_PORT="80"                   # Redirección HTTP → HTTPS
API_KEY="CAMBIA_ESTA_CLAVE_SECRETA"   # ← CAMBIA ESTO por una clave larga y aleatoria
DOMAIN=""                              # Tu IP pública o dominio (déjalo vacío para autodetectar)
LT_USER="languagetool"                 # Usuario del sistema para correr el servicio
# ─────────────────────────────────────────────────────────────────────────────

# Color para mensajes
info()    { echo -e "\e[36m[INFO]\e[0m  $*"; }
ok()      { echo -e "\e[32m[ OK ]\e[0m  $*"; }
warn()    { echo -e "\e[33m[WARN]\e[0m  $*"; }
err_exit(){ echo -e "\e[31m[ERR ]\e[0m  $*"; exit 1; }

# Autodetectar IP pública si no se configuró DOMAIN
if [ -z "$DOMAIN" ]; then
  DOMAIN=$(curl -s --max-time 5 ifconfig.me || curl -s --max-time 5 api.ipify.org || echo "")
  [ -z "$DOMAIN" ] && err_exit "No se pudo detectar la IP pública. Define DOMAIN manualmente."
  info "IP pública detectada: $DOMAIN"
fi

info "=== GramChecker — Instalación de LanguageTool Server ==="
info "Versión LT : $LT_VERSION"
info "Servidor   : https://$DOMAIN"
info "API Key    : [oculta por seguridad]"
echo ""

# ── 1. Dependencias ──────────────────────────────────────────────────────────
info "Actualizando paquetes..."
apt-get update -qq && apt-get upgrade -y -qq

# Crear SWAP de 2 GB (esencial para instancias con 1 GB RAM como AMD Micro)
if [ ! -f /swapfile ]; then
  info "Creando swap de 2 GB (necesario para 1 GB RAM)..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Reducir uso de swap al mínimo (solo cuando la RAM esté casi llena)
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  sysctl -p >/dev/null 2>&1
  ok "Swap de 2 GB creado y activado."
fi

info "Instalando Java 17, nginx, unzip, curl..."
apt-get install -y -qq openjdk-17-jre-headless nginx unzip curl apache2-utils ufw

# ── 2. Usuario dedicado (sin shell, sin login) ────────────────────────────────
if ! id "$LT_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$LT_USER"
  ok "Usuario '$LT_USER' creado."
fi

# ── 3. Descargar LanguageTool ─────────────────────────────────────────────────
LT_DIR="/opt/languagetool"
LT_ZIP="/tmp/languagetool.zip"
LT_URL="https://languagetool.org/download/LanguageTool-${LT_VERSION}.zip"

mkdir -p "$LT_DIR"

if [ ! -f "$LT_DIR/languagetool-server.jar" ]; then
  info "Descargando LanguageTool $LT_VERSION (~200 MB)..."
  curl -L --progress-bar "$LT_URL" -o "$LT_ZIP"

  info "Descomprimiendo..."
  unzip -q "$LT_ZIP" -d /tmp/lt_extracted
  cp -r /tmp/lt_extracted/LanguageTool-${LT_VERSION}/* "$LT_DIR/"
  rm -rf /tmp/lt_extracted "$LT_ZIP"
  ok "LanguageTool instalado en $LT_DIR"
else
  warn "LanguageTool ya existe en $LT_DIR — omitiendo descarga."
fi

chown -R "$LT_USER:$LT_USER" "$LT_DIR"

# ── 4. Servicio systemd ───────────────────────────────────────────────────────
info "Configurando servicio systemd..."
cat > /etc/systemd/system/languagetool.service << EOF
[Unit]
Description=LanguageTool Grammar Server
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=${LT_USER}
WorkingDirectory=${LT_DIR}
ExecStart=/usr/bin/java -Xmx${LT_HEAP} -cp ${LT_DIR}/languagetool-server.jar \
    org.languagetool.server.HTTPServer \
    --port ${LT_PORT} \
    --allow-origin "http://localhost" \
    --public
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=${LT_DIR}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable languagetool
systemctl start languagetool
ok "Servicio languagetool activo y habilitado al inicio."

# ── 5. Nginx — reverse proxy con autenticación por API Key ───────────────────
info "Configurando Nginx..."

# Certificado SSL auto-firmado (para HTTPS sin dominio con Let's Encrypt)
SSL_DIR="/etc/nginx/ssl"
mkdir -p "$SSL_DIR"
if [ ! -f "$SSL_DIR/gramchecker.crt" ]; then
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$SSL_DIR/gramchecker.key" \
    -out    "$SSL_DIR/gramchecker.crt" \
    -subj   "/CN=${DOMAIN}/O=GramChecker/C=CO" \
    -addext "subjectAltName=IP:${DOMAIN}" 2>/dev/null
  ok "Certificado SSL auto-firmado generado (válido 10 años)."
fi

# Configuración de Nginx
cat > /etc/nginx/sites-available/languagetool << NGINXEOF
# Redirigir HTTP → HTTPS
server {
    listen ${NGINX_HTTP_PORT};
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

# Servidor HTTPS con autenticación por API Key
server {
    listen ${NGINX_PORT} ssl;
    server_name ${DOMAIN};

    ssl_certificate     ${SSL_DIR}/gramchecker.crt;
    ssl_certificate_key ${SSL_DIR}/gramchecker.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Cabecera de seguridad
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;

    # Rechazar peticiones sin API Key válida
    location / {
        # Verificar API Key en el header X-API-Key
        if (\$http_x_api_key != "${API_KEY}") {
            return 403 '{"error":"API key inválida o ausente"}';
        }
        add_header Content-Type application/json always;

        proxy_pass         http://127.0.0.1:${LT_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        client_max_body_size 512k;
    }
}
NGINXEOF

# Activar sitio
ln -sf /etc/nginx/sites-available/languagetool /etc/nginx/sites-enabled/languagetool
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
ok "Nginx configurado y activo."

# ── 6. Firewall UFW ──────────────────────────────────────────────────────────
info "Configurando firewall UFW..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow "${NGINX_PORT}/tcp"   # HTTPS
ufw allow "${NGINX_HTTP_PORT}/tcp" # HTTP (para redirección)
ufw --force enable
ok "Firewall configurado: solo SSH + HTTPS abiertos."

# ── 7. También abrir el puerto en iptables de Oracle Cloud ───────────────────
info "Abriendo puertos en iptables (Oracle Cloud los cierra por defecto)..."
iptables -I INPUT 6 -m state --state NEW -p tcp --dport ${NGINX_PORT} -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport ${NGINX_HTTP_PORT} -j ACCEPT

# Guardar reglas para que persistan al reiniciar
apt-get install -y -qq iptables-persistent
netfilter-persistent save

ok "Puertos ${NGINX_HTTP_PORT} y ${NGINX_PORT} abiertos en iptables."

# ── 8. Esperar y verificar LanguageTool ──────────────────────────────────────
info "Esperando que LanguageTool arranque (hasta 30s)..."
for i in $(seq 1 15); do
  if curl -sf "http://localhost:${LT_PORT}/v2/languages" >/dev/null 2>&1; then
    ok "LanguageTool respondiendo en localhost:${LT_PORT}"
    break
  fi
  sleep 2
done

# ── 9. Resumen final ─────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  INSTALACIÓN COMPLETADA"
echo "═══════════════════════════════════════════════════════════"
echo "  URL del servidor  : https://${DOMAIN}"
echo "  API Key           : ${API_KEY}"
echo "  Estado servicio   : $(systemctl is-active languagetool)"
echo ""
echo "  NEXT STEPS:"
echo "  1. En Oracle Cloud Console → Networking → VCN"
echo "     → Security Lists → Ingress Rules:"
echo "     Agrega puerto TCP ${NGINX_PORT} (0.0.0.0/0)"
echo ""
echo "  2. En la extensión Chrome:"
echo "     • URL del servidor: https://${DOMAIN}"
echo "     • API Key: ${API_KEY}"
echo "     • Activa 'Aceptar certificado auto-firmado' si aparece advertencia"
echo "═══════════════════════════════════════════════════════════"
