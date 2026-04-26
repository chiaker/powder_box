FROM node:20-slim

WORKDIR /app

# Уменьшаем вероятность зависания npm в Docker
ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_PROGRESS=false \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_TIMEOUT=120000

COPY package.json package-lock.json ./
RUN npm ci --no-audit

COPY . .
EXPOSE 3000

ENV VITE_PROXY_TARGET=http://api-gateway:8000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
