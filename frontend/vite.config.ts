import { defineConfig, loadEnv } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    const required = [
      'VITE_BACKEND_URL', 'VITE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID', 'VITE_MAP_BOX_API_TOKEN',
    ]
    const missing = required.filter(key => !env[key]?.trim())
    if (missing.length) {
      throw new Error(`Missing static-site build variables: ${missing.join(', ')}`)
    }
    const apiURL = new URL(env.VITE_BACKEND_URL)
    if (apiURL.protocol !== 'https:' || apiURL.username || apiURL.password ||
        apiURL.search || apiURL.hash) {
      throw new Error('VITE_BACKEND_URL must be an HTTPS API URL without credentials, query or fragment')
    }
    if (!env.VITE_MAP_BOX_API_TOKEN.startsWith('pk.')) {
      throw new Error('VITE_MAP_BOX_API_TOKEN must be a public Mapbox token (pk.), not a secret token')
    }
  }

  return {
    plugins: [preact()],
    resolve: {
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    },
    server: {
      host: '0.0.0.0',
      port: parseInt(process.env.PORT ?? '5173') || 5173,  // for dev
    },
    preview: {
      host: '0.0.0.0',
      port: parseInt(process.env.PORT ?? '4173') || 4173,  // for preview
      allowedHosts: ['routecast.onrender.com']
    }
  }
})
