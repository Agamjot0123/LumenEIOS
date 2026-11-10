bash <<'LUMEN_SETUP'
set -euo pipefail

repo=/workspace/arena
app=$repo/apps/lumeneios
node_env=/workspace/.lumeneios-node
jupyter=/opt/sys-venv/bin/jupyter

if [ ! -d "$repo/.git" ]; then
  git clone --branch sync/lumeneios-updates --single-branch \
    https://github.com/kvr-leofelix/arena.git "$repo"
fi
cd "$app"

if [ ! -x "$node_env/bin/node" ]; then
  conda create -y --prefix "$node_env" --override-channels -c conda-forge nodejs=22
fi
export PATH="$node_env/bin:$PATH"

if [ ! -x .venv/bin/pip ]; then
  if ! python3 -m venv .venv; then
    python_minor=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    apt-get update
    apt-get install -y "python${python_minor}-venv"
    python3 -m venv .venv
  fi
fi
.venv/bin/python -m pip install -r backend/requirements.txt

export OLLAMA_HOST=127.0.0.1:11434
if ! curl -fsS --max-time 3 http://127.0.0.1:11434/api/version >/dev/null; then
  nohup ollama serve > "$app/ollama.log" 2>&1 </dev/null &
fi
curl -fsS --retry 10 --retry-connrefused --retry-delay 1 \
  http://127.0.0.1:11434/api/version
printf '\n'
ollama pull qwen2.5vl:7b

if [ ! -e .env ]; then
  secret=$(.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(48))')
  (umask 077; cat > .env <<EOF
APP_ENV=production
DEBUG=false
DEMO_MODE=false
DEMO_ROOT_PASSWORD=
SECRET_KEY=$secret
OLLAMA_BASE_URL=http://127.0.0.1:11434
QWEN_QUESTION_STUDIO_MODEL_ID=qwen2.5vl:7b
EOF
  )
  unset secret
fi

sed -i 's|<BrowserRouter>|<BrowserRouter basename="/proxy/absolute/3001">|' src/main.tsx
npm ci
VITE_API_URL=/proxy/8000/api/v1 VITE_DEMO_MODE=false \
  npm run build -- --base=/proxy/absolute/3001/

# Supervisor brings the app back after a Vast reboot.
cat > /etc/supervisor/conf.d/lumeneios.conf <<EOF
[program:lumeneios-api]
directory=$app
command=$app/.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=$app/backend.log

[program:lumeneios-web]
directory=$app
command=$node_env/bin/node $app/node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 3001 --strictPort --base=/proxy/absolute/3001/
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=$app/frontend.log
EOF

supervisorctl reread
supervisorctl update

jupyter_python=$(sed -n '1s/^#!//p' "$jupyter")
test -x "$jupyter_python"
.venv/bin/python -m pip --python "$jupyter_python" install jupyter-server-proxy
"$jupyter" server extension enable --sys-prefix jupyter_server_proxy

curl -fsS --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:8000/health
printf '\n'
curl -fsS -o /dev/null -w 'Frontend HTTP %{http_code}\n' \
  http://127.0.0.1:3001/proxy/absolute/3001/
printf '\nSetup complete. Open /proxy/absolute/3001/ on your Jupyter address.\n'
LUMEN_SETUP