import fs from 'fs';
import path from 'path';

const name = process.argv[2];
if (!name) process.exit(1);

const root = path.resolve('apps', name);
fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.mkdirSync(path.join(root, 'db'), { recursive: true });

const pkg = {
    name,
    type: "module",
    scripts: {
        "build": "esbuild src/handler.js --bundle --platform=node --format=esm --outfile=build/handler.js",
        "dev": "node src/index.js"
    }
};

const handler = `export const handler = (req, res) => res.end("Hello from ${name}");`;
const index = `import { handler } from './handler.js'; import http from 'http'; http.createServer(handler).listen(4000);`;

fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2));
fs.writeFileSync(path.join(root, 'src/handler.js'), handler);
fs.writeFileSync(path.join(root, 'src/index.js'), index);

console.log(`✨ Приложение ${name} создано в apps/${name}`);