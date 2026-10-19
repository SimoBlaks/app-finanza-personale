import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // percorsi relativi: l'app funziona anche dentro una sottocartella
  // (GitHub Pages la pubblica su /app-finanza-personale/)
  base: './',
})
