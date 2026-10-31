import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronExecutable = require('electron');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..');

// Loại bỏ ELECTRON_RUN_AS_NODE (do VS Code terminal thiết lập) để Electron khởi chạy chế độ Desktop GUI
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronExecutable, ['.'], {
  cwd: workspaceRoot,
  env,
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

