FROM node:18-alpine

WORKDIR /app
COPY . .
RUN npm install --omit=dev

VOLUME ["/app/save"]

CMD ["node", "server.mjs"] 