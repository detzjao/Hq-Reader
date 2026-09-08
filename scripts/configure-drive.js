import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const root = process.cwd();
const examplePath = path.join(root, 'backend', '.env.example');
const envPath = path.join(root, 'backend', '.env');

const rl = readline.createInterface({ input, output });

try {
  console.log('\nHQ Reader — configuração do Google Drive\n');
  console.log('Use uma API Key do SEU projeto Google Cloud com a Google Drive API ativada.');
  console.log('A chave não precisa ser do proprietário da pasta.\n');

  const key = (await rl.question('Cole sua DRIVE_API_KEY: ')).trim();
  if (!key) {
    console.error('\nNenhuma chave informada. O arquivo .env não foi alterado.');
    process.exitCode = 1;
  } else if (/\s/.test(key)) {
    console.error('\nA chave contém espaços e parece inválida. O arquivo .env não foi alterado.');
    process.exitCode = 1;
  } else {
    const template = await fs.readFile(examplePath, 'utf8');
    const configured = template.replace(/^DRIVE_API_KEY=.*$/m, `DRIVE_API_KEY=${key}`);
    await fs.writeFile(envPath, configured, { mode: 0o600 });
    console.log('\nbackend/.env criado com sucesso.');
    console.log('Agora execute: npm run dev\n');
  }
} catch (error) {
  console.error(`\nNão foi possível criar backend/.env: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
