import { NodeSSH } from 'node-ssh';
import path from 'path';
import { execSync } from 'child_process';

const ssh = new NodeSSH();

// Парсинг аргументов --app=name, --build, --self, --db, --reload
const args = process.argv.slice(2).reduce((acc, arg) => {
    if (arg.startsWith('--')) {
        const [key, value] = arg.replace('--', '').split('=');
        acc[key] = value || true;
    }
    return acc;
}, {});

// Авто-определение приложения, если запущено из папки apps/name
let targetApp = args.app;
const currentDir = process.cwd();
if (!targetApp && currentDir.includes(path.sep + 'apps' + path.sep)) {
    targetApp = path.basename(currentDir);
}

async function run() {
    if (!targetApp && !args.self && !args['reload-only']) {
        console.error("❌ Укажите приложение: --app=name или используйте --self / --reload-only");
        process.exit(1);
    }

    try {
        await ssh.connect({
            host: process.env.SSH_HOST,
            username: process.env.SSH_USER,
            password: process.env.SSH_PASS
        });

        const remoteRoot = process.env.REMOTE_ROOT;

        // 1. Деплой движка (server)
        if (args.self) {
            console.log("🛠️  Обновление движка (server)...");
            await ssh.putDirectory('./server', `${remoteRoot}/server`, {
                recursive: true,
                validate: (p) => !p.includes('node_modules') && !p.includes('.git')
            });
            await ssh.execCommand('pnpm install', { cwd: `${remoteRoot}/server` });
        }

        // 2. Деплой приложения
        if (targetApp && !targetApp.startsWith('_')) {
            console.log(`📦 Деплой приложения: ${targetApp}`);
            const localPath = path.resolve('apps', targetApp);
            const remotePath = `${remoteRoot}/apps/${targetApp}`;

            if (args.build) {
                console.log("🏗️  Сборка...");
                execSync(`pnpm --filter ${targetApp} run build`, { stdio: 'inherit' });
            }

            await ssh.execCommand(`mkdir -p ${remotePath}/build`);

            console.log("📤 Загрузка файлов...");
            await ssh.putDirectory(`${localPath}/build`, `${remotePath}/build`, { recursive: true });
            await ssh.putFile(`${localPath}/package.json`, `${remotePath}/package.json`);

            if (args.db) {
                console.log("💾 Синхронизация базы данных...");
                await ssh.putDirectory(`${localPath}/db`, `${remotePath}/db`, { recursive: true });
            }

            console.log("📦 Установка зависимостей на сервере...");
            await ssh.execCommand('pnpm install --production', { cwd: remotePath });
        }

        // 3. Перезагрузка
        if (args.reload || args['reload-only']) {
            console.log("♻️  Перезапуск PM2...");
            await ssh.execCommand('pm2 reload gateway');
        }

        if (args.ssl) {
            console.log("🔒 Запуск обновления SSL на сервере...");
            // Вызываем нашу новую команду на сервере
            await ssh.execCommand('npm run ssl:update', { cwd: `${remoteRoot}/server` });
        }

        console.log("✅ Готово!");
    } catch (err) {
        console.error("❌ Ошибка:", err.message);
    } finally {
        ssh.dispose();
    }
}

run();