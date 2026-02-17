import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Берем домен и путь из переменных окружения (которые прописаны в ecosystem.config.cjs или .env)
const DOMAIN = process.env.DOMAIN;
const APPS_ROOT = path.resolve(process.cwd(), '..', 'apps');

if (!DOMAIN) {
    console.error("❌ Ошибка: Переменная DOMAIN не определена.");
    process.exit(1);
}

async function updateSsl() {
    console.log("🔍 Сканирование папки apps для поиска поддоменов...");

    const folders = fs.readdirSync(APPS_ROOT);
    
    // Формируем список доменов
    // Начинаем с основного домена и www
    const domainList = [DOMAIN, `www.${DOMAIN}`];

    folders.forEach(folder => {
        // Пропускаем временные папки, папку www (так как уже добавили) и скрытые файлы
        if (!folder.startsWith('_') && folder !== 'www' && !folder.startsWith('.')) {
            domainList.push(`${folder}.${DOMAIN}`);
        }
    });

    console.log(`📡 Список найденных доменов: ${domainList.join(', ')}`);

    // Формируем команду для Certbot
    // --expand говорит Certbot обновить существующий сертификат, добавив новые домены
    // --non-interactive позволяет запускать без вопросов
    const certbotArgs = domainList.map(d => `-d ${d}`).join(' ');
    const command = `sudo certbot --nginx ${certbotArgs} --non-interactive --agree-tos --expand --redirect`;

    try {
        console.log("🔐 Запуск Certbot...");
        execSync(command, { stdio: 'inherit' });
        console.log("✅ SSL сертификаты успешно обновлены и применены к Nginx!");
    } catch (error) {
        console.error("❌ Ошибка при выполнении Certbot:", error.message);
    }
}

updateSsl();