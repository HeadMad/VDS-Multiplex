import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const ssh = new NodeSSH();

async function ask(question, defaultValue = '') {
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question(`${question} ${defaultValue ? `[${defaultValue}]` : ''}: `);
    rl.close();
    return answer.trim() || defaultValue;
}

async function startSetup() {
    const envPath = path.resolve('.env');
    let config = {};

    if (!fs.existsSync(envPath)) {
        console.log("📝 Настройка нового окружения...\n");
        
        config.SSH_HOST = await ask("Введите IP вашего VDS");
        config.SSH_USER = await ask("Введите имя пользователя SSH", "ubuntu");
        config.SSH_PASS = await ask("Введите пароль SSH");
        config.DOMAIN = await ask("Введите основной домен", "site.com");
        config.PORT = await ask("Введите порт для роутера", "3000"); // Добавили вопрос про порт
        config.REMOTE_ROOT = await ask("Введите путь установки", "/var/www/vds-multiplex");

        const envContent = Object.entries(config)
            .map(([key, val]) => `${key}=${val}`)
            .join('\n');
        
        fs.writeFileSync(envPath, envContent);
    } else {
        // Подгружаем существующие данные
        config = {
            SSH_HOST: process.env.SSH_HOST,
            SSH_USER: process.env.SSH_USER,
            SSH_PASS: process.env.SSH_PASS,
            DOMAIN: process.env.DOMAIN,
            PORT: process.env.PORT || '3000',
            REMOTE_ROOT: process.env.REMOTE_ROOT,
        };
    }

    try {
        await ssh.connect({ host: config.SSH_HOST, username: config.SSH_USER, password: config.SSH_PASS });

        // 1. Nginx (теперь с динамическим портом)
        console.log(`🌐 Настройка Nginx на порт ${config.PORT}...`);
        const nginxConfig = `
server {
    listen 80;
    server_name .${config.DOMAIN};
    location / {
        proxy_pass http://localhost:${config.PORT};
        proxy_set_header Host $host;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}`.trim();

        await ssh.execCommand(`echo "${nginxConfig}" | sudo tee /etc/nginx/sites-available/${config.DOMAIN}`);
        await ssh.execCommand(`sudo ln -sf /etc/nginx/sites-available/${config.DOMAIN} /etc/nginx/sites-enabled/`);
        await ssh.execCommand(`sudo systemctl restart nginx`);

        // 2. PM2 (передаем порт в переменные окружения)
        console.log("⚙️  Настройка PM2...");
        const ecosystem = `
module.exports = {
  apps: [{
    name: 'gateway',
    script: 'index.js',
    cwd: '${config.REMOTE_ROOT}/server',
    env: { NODE_ENV: 'production', PORT: ${config.PORT} }
  }]
};`.trim();
        await ssh.execCommand(`mkdir -p ${config.REMOTE_ROOT}/server`);
        await ssh.execCommand(`echo "${ecosystem}" > ${config.REMOTE_ROOT}/server/ecosystem.config.cjs`);

        // 3. Загрузка движка и запуск
        console.log("📤 Загрузка и запуск роутера...");
        await ssh.putDirectory('./server', `${config.REMOTE_ROOT}/server`, {
            recursive: true,
            validate: (p) => !p.includes('node_modules')
        });

        await ssh.execCommand('pnpm install', { cwd: `${config.REMOTE_ROOT}/server` });
        await ssh.execCommand('pm2 start ecosystem.config.cjs || pm2 reload ecosystem.config.cjs', { cwd: `${config.REMOTE_ROOT}/server` });
        await ssh.execCommand('pm2 save');

        console.log(`\n🎉 ГОТОВО! Роутер работает на порту ${config.PORT}`);

    } catch (err) {
        console.error("\n❌ Ошибка:", err.message);
    } finally {
        ssh.dispose();
    }
}

startSetup();