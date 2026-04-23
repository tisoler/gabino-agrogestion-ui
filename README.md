# Gabino Agrogestión

Herramienta de gestión agraria con un enfoque mobile-first.

## Estructura del proyecto

- `gabino-agrogestion-api/`: Backend construido con NestJS (TypeScript).
- `gabino-agrogestion-ui/`: Frontend construido con React + Vite (TypeScript).

## Tecnologías principales

- **Backend**: NestJS, TypeORM, PostgreSQL.
- **Frontend**: React, Lucide React, CSS Moderno.
- **Autenticación**: Firebase Auth.
- **Package Manager**: pnpm.

## Ejecución local

Asegúrate de configurar los archivos `.env` respectivos en `gabino-agrogestion-api/` y `gabino-agrogestion-ui/`.

### API
```bash
cd gabino-agrogestion-api
pnpm install
pnpm run start:dev
```

### UI
```bash
cd gabino-agrogestion-ui
pnpm install
pnpm run dev
```
