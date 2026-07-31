module.exports = {
  apps: [
    {
      name: "sacco-web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3002",
      env: {
        NODE_ENV: "production",
        PORT: 3002
      },
    },
    {
      name: "sacco-socket",
      script: "npm",
      args: "run socket",
    },
    {
      name: "sacco-workers",
      script: "npm",
      args: "run workers",
    },
  ],
}
