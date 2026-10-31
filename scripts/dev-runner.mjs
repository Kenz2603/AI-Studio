import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const electronExecutable = require('electron');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..');

async function startDev() {
  const server = await createServer({
    configFile: path.join(workspaceRoot, 'vite.config.ts'),
  });
  await server.listen();

  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 5173;
  const devUrl = `http://127.0.0.1:${port}`;
  console.log(`[Personal AI Studio] Vite Dev Server running at ${devUrl}`);

  const env = {
    ...process.env,
    VITE_DEV_SERVER_URL: devUrl,
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const electronProc = spawn(electronExecutable, ['.'], {
    cwd: workspaceRoot,
    env,
    stdio: 'inherit',
  });

  electronProc.on('exit', async (code) => {
    await server.close();
    process.exit(code ?? 0);
  });
}

startDev().catch((err) => {
  console.error('[Personal AI Studio] Lỗi khởi chạy chế độ dev:', err);
  process.exit(1);
});

