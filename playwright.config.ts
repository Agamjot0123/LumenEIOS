import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
const isolated = process.env.LUMENEIOS_E2E_DIR || mkdtempSync(join(tmpdir(), 'lumen-browser-'));
process.env.LUMENEIOS_E2E_DIR = isolated;
const python = process.env.LUMENEIOS_TEST_PYTHON || 'python';
export default defineConfig({
  testDir:'./tests/e2e', testMatch:process.env.LUMENEIOS_DEMO_E2E==='true'?'demo.spec.ts':'homework.spec.ts', workers:1, timeout:90000, reporter:'list',
  use:{baseURL:'http://127.0.0.1:14173',headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge'},
  webServer:[
    {command:`"${python}" -B -m backend.tests.browser_server`,
     url:'http://127.0.0.1:18080/health',reuseExistingServer:false,timeout:60000,
     env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',APP_ENV:'test',DEMO_MODE:'false',DEBUG:'false',
       SECRET_KEY:randomBytes(32).toString('hex'),DATABASE_URL:`sqlite+aiosqlite:///${join(isolated,'test.db').replaceAll('\\','/')}`,
       STORAGE_LOCAL_DIR:join(isolated,'uploads'),BACKEND_CORS_ORIGINS:'["http://127.0.0.1:14173"]'}},
    {command:'npm run preview -- --host 127.0.0.1 --port 14173 --strictPort',url:'http://127.0.0.1:14173',reuseExistingServer:false}
  ]
});
