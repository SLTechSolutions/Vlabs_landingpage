module.exports = {
  apps: [
    {
      name: "vlabs-landingpage",
      script: "/home/administrator/.nvm/versions/node/v24.15.0/bin/npm",
      args: ["run", "dev"],
      cwd: "/home/administrator/Documents/automark-1.0.0",
      interpreter: "/home/administrator/.nvm/versions/node/v24.15.0/bin/node",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "development",
        HOST: "127.0.0.1",
        PORT: "4321",
        CMS_MEDIA_UPLOADS_ENABLED: "false",
      },
      out_file: "logs/vlabs-out.log",
      error_file: "logs/vlabs-err.log",
      pid_file: "logs/vlabs.pid",
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "1G",
      // Astro and the theme generator handle source watching.
      watch: false,
      ignore_watch: ["logs", "node_modules", ".git", ".astro"],
      restart_delay: 1000,
    },
  ],
};
