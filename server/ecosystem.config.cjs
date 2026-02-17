module.exports = {
  apps: [
    {
      name: 'gateway',
      script: 'index.js',
      cwd: '/var/www/my-project/server', // Измените на ваш путь на VDS
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};