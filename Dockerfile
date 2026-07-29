# Dockerfile para quipu (React Frontend)

FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json pnpm-lock.yaml ./

# Instalar pnpm
RUN npm install -g pnpm

# Instalar dependencias
RUN pnpm install --frozen-lockfile

# Copiar código fuente
COPY . .

# Variables de entorno para el build (se pasan como build args)
ARG VITE_API_URL=https://api.bonoclubes.tisoler.net.ar/api
ENV VITE_API_URL=$VITE_API_URL

ARG VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY

ARG VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN

ARG VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID

ARG VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET

ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID

ARG VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

ARG VITE_FIREBASE_MEASUREMENT_ID
ENV VITE_FIREBASE_MEASUREMENT_ID=$VITE_FIREBASE_MEASUREMENT_ID

# Construir la aplicación
RUN pnpm run build

# Imagen de producción con Apache
FROM httpd:alpine

# Copiar configuración de Apache para permitir .htaccess
RUN sed -i \
    -e 's/^#\(LoadModule rewrite_module modules\/mod_rewrite.so\)/\1/' \
    -e 's/AllowOverride None/AllowOverride All/g' \
    /usr/local/apache2/conf/httpd.conf

# Copiar los archivos construidos
COPY --from=builder /app/dist /usr/local/apache2/htdocs/

# Exponer puerto (Apache escucha en 80 por defecto)
EXPOSE 80

# Iniciar Apache
CMD ["httpd", "-D", "FOREGROUND"]
