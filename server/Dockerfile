FROM node:24-slim

# ставим инструменты для сборки
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# копируем только package.json, чтобы зависимости собрал Docker
COPY package*.json ./

# устанавливаем зависимости прямо в контейнере
RUN npm install

# теперь копируем остальной код
COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
