Jellyfin YouTube Audio Downloader

Browser Extension (Chrome/Firefox) + Backend API (Node.js) + yt-dlp (Docker)

✅ Download YouTube video audio on-demand directly into your Jellyfin library
✅ No Web UI: everything is controlled from the browser extension
✅ No database: the filesystem is the single source of truth
✅ Security: API Key + LAN/VPN-only access

Architecture

Browser Extension (MV3)
    │ HTTPS/HTTP REST API (LAN/VPN)
    ▼
Backend API (Node.js)
    │ docker exec
    ▼
yt-dlp container
    │
    ▼
/mnt/media/music/<folder>/
    ▼
Jellyfin → Finamp (i personally use Finamp for listen my Jellyfin music library)

Requirements

Docker + Docker Compose

Jellyfin with a music library pointed to /mnt/media/music (or of cource your path, set also to .env)

A LAN server running:

Jellyfin (optional: can be elsewhere, but the folder must be accessible)

This project (API + yt-dlp)

Installation (Server)

1) Clone the repository
git clone https://github.com/<YOUR_USER>/<YOUR_REPO>.git
cd <YOUR_REPO>

2) Configure environment variables
Create/modify backend/.env:

```
PORT=8787
API_KEY=CHANGE_ME_LONG_RANDOM
MUSIC_ROOT=/mnt/media/music
YTDLP_CONTAINER=yt-dlp-music
CORS_ORIGINS=chrome-extension://*,moz-extension://*
```

Tip: generate a long random key:

```
openssl rand -hex 32
```

3) Verify music mount
Make sure the folder exists and is writable:

```
sudo mkdir -p /mnt/media/music
sudo chown -R $USER:$USER /mnt/media/music
```

4) Avvia con Docker Compose

```
docker compose up -d
docker compose logs -f api
```

5) Test the API (LAN)
From the server:

```
curl -s http://localhost:8787/api/health
```

From a PC on the LAN:

```
curl -s http://<LAN_SERVER_IP>:8787/api/health
```

Test the folders endpoint:

```
curl -s \
  -H "Authorization: Bearer CHANGE_ME_LONG_RANDOM" \
  http://<LAN_SERVER_IP>:8787/api/music/folders
```

Browser Extension Installation
Chrome / Edge

Go to chrome://extensions

Enable Developer mode

Click Load unpacked

Select the extension/ folder

Firefox (MV3)

Firefox supports MV3 with some differences; for testing:

Go to about:debugging#/runtime/this-firefox

Click Load Temporary Add-on

Select extension/manifest.json

Extension Configuration

Open the extension options and set:

API Base URL: http://<LAN_SERVER_IP>:8787

API Key: the one in backend/.env

Press Test Connection → it should display Connection OK ✅

Usage

Open any YouTube video

Click the extension icon

Select a folder or type a new target folder

Click Download audio

After the download completes, Jellyfin will index the new files (according to its scheduled scanning settings).

Security (LAN/VPN Only)
Minimum recommendations

Do NOT expose port 8787 to the internet (NO router port forwarding)

Use a strong API Key

Keep rate limiting enabled (already included)

UFW (optional but recommended)

Example: allow port 8787 only from LAN 192.168.1.0/24:

```
sudo ufw allow from 192.168.1.0/24 to any port 8787 proto tcp
sudo ufw deny 8787/tcp
sudo ufw status verbose
```

If using WireGuard, allow only the VPN subnet (e.g., 10.8.0.0/24):

```
sudo ufw allow from 10.8.0.0/24 to any port 8787 proto tcp
sudo ufw deny 8787/tcp
```

Note:
The browser extension makes HTTP requests to the LAN server.
On “guest” or segmented networks, ensure the user's PC can reach the server.

⚠️ Optional: Exposing the API (ADVANCED USERS ONLY)

Disclaimer – Security Warning
This project is designed to work LAN/VPN-only by default.
Exposing the API to the public internet is NOT recommended unless you fully understand the security implications.
If you expose this API:

- Use HTTPS only
- Protect it with strong API keys
- Restrict access with IP allowlists, VPN, or authentication middleware
- Never expose Docker directly

The maintainers are NOT responsible for misconfigurations, data loss, or abuse caused by public exposure.

Option 1 — Exposing the API with Traefik (Recommended)
This option is suitable if you already run Traefik as a reverse proxy for Jellyfin or other services.

Requirements:

- Traefik v2+
- HTTPS enabled (Let’s Encrypt or internal CA)

API container must NOT expose ports publicly

docker-compose.yml (Traefik labels)
Remove the ports: section from the API container and add Traefik labels:
```
services:
  api:
    image: node:20-alpine
    container_name: jellyfin-yt-api
    working_dir: /app
    volumes:
      - ./backend:/app
      - /mnt/media/music:/mnt/media/music
      - /var/run/docker.sock:/var/run/docker.sock
    env_file:
      - ./backend/.env
    command: sh -lc "npm ci || npm i && npm run start"
    networks:
      - traefik
    labels:
      - "traefik.enable=true"

      # Router
      - "traefik.http.routers.ytapi.rule=Host(`yt-api.example.com`)"
      - "traefik.http.routers.ytapi.entrypoints=https"
      - "traefik.http.routers.ytapi.tls=true"
      - "traefik.http.routers.ytapi.tls.certresolver=letsencrypt"

      # Service
      - "traefik.http.services.ytapi.loadbalancer.server.port=8787"

      # Middlewares (RECOMMENDED)
      - "traefik.http.routers.ytapi.middlewares=ytapi-ipallow@docker,ytapi-headers@docker"

      # IP allowlist (example: LAN + VPN)
      - "traefik.http.middlewares.ytapi-ipallow.ipallowlist.sourcerange=192.168.1.0/24,10.8.0.0/24"

      # Security headers
      - "traefik.http.middlewares.ytapi-headers.headers.customrequestheaders.X-Forwarded-Proto=https"
      - "traefik.http.middlewares.ytapi-headers.headers.framedeny=true"
      - "traefik.http.middlewares.ytapi-headers.headers.contenttypenosniff=true"
      - "traefik.http.middlewares.ytapi-headers.headers.browserxssfilter=true"

    restart: unless-stopped

networks:
  traefik:
    external: true
```

API Base URL (Extension)
https://yt-api.example.com

Traefik Security Notes:
- Do NOT expose without ipallowlist
- Prefer VPN-only access
- Do not rely on API Key alone if exposed publicly


Option 2 — Exposing the API with NGINX
Use this if you don’t run Traefik and prefer a traditional reverse proxy.

Requirements:

- NGINX
- HTTPS (Let’s Encrypt or equivalent)
- API listening on 127.0.0.1:8787 or Docker internal network

Example NGINX Virtual Host
```
server {
    listen 443 ssl http2;
    server_name yt-api.example.com;

    ssl_certificate     /etc/letsencrypt/live/yt-api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yt-api.example.com/privkey.pem;

    # OPTIONAL: restrict by IP (strongly recommended)
    allow 192.168.1.0/24;
    allow 10.8.0.0/24;
    deny all;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        proxy_read_timeout 900;
        proxy_connect_timeout 30;

        client_max_body_size 256k;
    }
}
```

API Base URL (Extension)
https://yt-api.example.com

Strongly Recommended Hardening (If Exposed)
1️⃣ Use VPN-only Access

Best practice:

- Expose API only inside WireGuard / OpenVPN
- Do not allow public IPs


2️⃣ Firewall (UFW example)
# Allow VPN
sudo ufw allow from 10.8.0.0/24 to any port 443 proto tcp

# Block everything else
sudo ufw deny 443/tcp
sudo ufw status verbose


3️⃣ Rotate API Keys
- Treat API keys like passwords
- Change immediately if leaked
- Never commit .env to GitHub

Final Recommendation
Default mode (LAN-only, no reverse proxy) is the safest and recommended setup.

Expose the API only if:

- You already expose Jellyfin
- You understand reverse proxies
- You restrict access via VPN or IP allowlists
- You accept the security responsibility

Troubleshooting

1) docker exec does not work

The API container uses /var/run/docker.sock.
Check that it is correctly mounted in your docker-compose file.

Verify the container name:

YTDLP_CONTAINER=yt-dlp-music

2) Download fails / throttling

YouTube may throttle requests.
Try a different URL and avoid playlists (--no-playlist is already enabled).

Check logs:

```
docker compose logs -f api
```

3) Files end up with strange names

--restrict-filenames is enabled for safety and compatibility.

4) Jellyfin does not detect new files

Make sure Jellyfin points to the same directory

Trigger Scan Library or enable automatic scanning


Roadmap

- Async jobs + jobId + polling
- Playlist download
- Preset folders
- Audio tagging / ID3 + normalization
- Browser notifications

License

MIT