import http from 'http';
import path from 'path';
import fs from 'fs';

// Конфигурация из переменных окружения или значения по умолчанию
const PORT = process.env.PORT || 3000;
//apps находится на уровень выше относительно /server/index.js
const APPS_ROOT = path.resolve(process.cwd(), '..', 'apps'); 

const handlers = new Map(); // Кэш обработчиков в памяти

/**
 * Извлекает имя приложения из заголовка Host
 */
function getAppName(host = '') {
    const hostname = host.split(':')[0];
    const parts = hostname.split('.');

    // Разработка: sub.localhost:3000 -> sub
    if (hostname.endsWith('.localhost')) return parts[0];

    // Продакшен: sub.domain.com -> sub, domain.com -> www
    if (parts.length > 2) return parts[0];
    return 'www'; 
}

const server = http.createServer(async (req, res) => {
    const appName = getAppName(req.headers.host);
    
    // Пытаемся получить обработчик из кэша
    let handler = handlers.get(appName);

    if (!handler) {
        // Стандартный путь к обработчику: /apps/name/build/handler.js
        const handlerPath = path.join(APPS_ROOT, appName, 'build', 'handler.js');

        if (fs.existsSync(handlerPath)) {
            try {
                // Динамический импорт с cache-busting таймстампом
                const moduleUrl = `file://${handlerPath}?v=${Date.now()}`;
                const { handler: newHandler } = await import(moduleUrl);

                if (typeof newHandler === 'function') {
                    handler = newHandler;
                    handlers.set(appName, handler);
                    console.log(`[Router] Приложение [${appName}] загружено в память`);
                } else {
                    throw new Error('Export "handler" is not a function');
                }
            } catch (err) {
                console.error(`[Router] Ошибка загрузки приложения [${appName}]:`, err.message);
                res.statusCode = 500;
                return res.end('Internal Server Error: Failed to load application handler');
            }
        } else {
            res.statusCode = 404;
            return res.end(`404: App [${appName}] not found. Build it and deploy first.`);
        }
    }

    // Запуск обработчика приложения
    try {
        // Передаем req, res и пустой next (для совместимости с Express/Connect)
        await handler(req, res, (err) => {
            if (err) {
                res.statusCode = 500;
                res.end("App Middleware Error");
            }
        });
    } catch (err) {
        console.error(`[Router] Ошибка выполнения в приложении [${appName}]:`, err);
        if (!res.headersSent) {
            res.statusCode = 500;
            res.end("Critical App Error");
        }
    }
});

// Слушаем системные сообщения (например, от деплоера через PM2)
process.on('message', (msg) => {
    if (msg === 'clear_cache') {
        handlers.clear();
        console.log('[Router] Кэш приложений очищен');
    }
});

server.listen(PORT, () => {
    console.log(`🚀 VDS-Multiplex Router running on port ${PORT}`);
    console.log(`📂 Apps directory: ${APPS_ROOT}`);
});