#!/bin/bash
# Run this on the Droplet after SSH-ing in

set -e

echo "=== Installing Node.js 22 ==="
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo "=== Installing PM2 ==="
npm install -g pm2

echo "=== Setting up worker directory ==="
mkdir -p /opt/heliopolis-worker
cd /opt/heliopolis-worker

echo "=== Done! Now:"
echo "  1. Copy worker files (package.json + index.js) to /opt/heliopolis-worker/"
echo "  2. Create .env file with your secrets"
echo "  3. Run: cd /opt/heliopolis-worker && npm install"
echo "  4. Run: pm2 start ecosystem.config.cjs"
echo "  5. Run: pm2 save && pm2 startup"
