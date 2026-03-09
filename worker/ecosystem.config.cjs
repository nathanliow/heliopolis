const { readFileSync } = require("fs");

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

module.exports = {
  apps: [{
    name: "heliopolis-worker",
    script: "index.js",
    cwd: "/opt/heliopolis-worker",
    env: loadEnv("/opt/heliopolis-worker/.env"),
    restart_delay: 2000,
    max_restarts: 50,
    autorestart: true,
  }],
};
