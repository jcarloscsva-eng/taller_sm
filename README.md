# TallerOS

Sistema de gestión para taller mecánico.

## Instalación

```bash
npm install
```

## Desarrollo local

```bash
npm run dev
```

Abre http://localhost:5173/taller-os/ en el navegador.

## Publicar en GitHub Pages

1. Sube el código a GitHub:
```bash
git init
git add .
git commit -m "Primera version"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/taller-os.git
git push -u origin main
```

2. Publica:
```bash
npm run deploy
```

La app quedará en: `https://TU_USUARIO.github.io/taller-os/`
