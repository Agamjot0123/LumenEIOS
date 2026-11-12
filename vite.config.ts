import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({command,mode}) => {
  const env=loadEnv(mode,process.cwd(),'VITE_');
  if(command==='build' && env.VITE_DEMO_MODE!=='true') {
    if(!env.VITE_API_URL) throw new Error('Live builds require an explicit VITE_API_URL.');
    let url: URL;
    try {url=new URL(env.VITE_API_URL);} catch {throw new Error('VITE_API_URL must be a valid API base URL.');}
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if((url.protocol!=='https:' && !(local && url.protocol==='http:')) || url.username || url.password || url.search || url.hash)
      throw new Error('VITE_API_URL must use HTTPS (or local test HTTP) without credentials, query or fragment.');
  }
  return {
    plugins:[react()],
    resolve:{alias:{'@':path.resolve(__dirname,'./src')}},
    server:{port:3000,open:false,host:'127.0.0.1'},
  };
});
