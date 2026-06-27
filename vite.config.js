import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cambia 'taller-os' por el nombre exacto de tu repositorio en GitHub
export default defineConfig({
  plugins: [react()],
  base: '/taller_sm/',
})
