import { NodeSSH } from 'node-ssh';
import path from 'path';

const ssh = new NodeSSH();
const appName = process.argv[2];

async function backup() {
    if (!appName) return console.error("Укажите имя приложения");

    try {
        await ssh.connect({ host: process.env.SSH_HOST, username: process.env.SSH_USER, password: process.env.SSH_PASS });
        
        const remotePath = `${process.env.REMOTE_ROOT}/apps/${appName}`;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archiveName = `${appName}-${timestamp}.tar.gz`;

        console.log(`📦 Упаковка ${appName} на сервере...`);
        await ssh.execCommand(`tar -czf /tmp/${archiveName} .`, { cwd: remotePath });

        console.log(`📥 Загрузка бэкапа...`);
        await ssh.getFile(`./backups/${archiveName}`, `/tmp/${archiveName}`);
        
        await ssh.execCommand(`rm /tmp/${archiveName}`);
        console.log(`✅ Бэкап сохранен: backups/${archiveName}`);
    } catch (e) {
        console.error(e);
    } finally {
        ssh.dispose();
    }
}
backup();