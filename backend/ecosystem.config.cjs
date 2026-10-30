module.exports = {
  apps: [
    {
      name: "vbspu-api",
      script: "src/server.js",
      cwd: "/var/www/html/vbspu-dashboard.demoquaeretech.in/backend",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};