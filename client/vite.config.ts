import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: {
      key: fs.readFileSync(path.resolve(__dirname, 'cert/key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, 'cert/cert.pem')),
    },
  },
});
