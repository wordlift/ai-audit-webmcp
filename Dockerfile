FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# The versioned action model and the demo fixtures are data the server reads at runtime.
COPY --from=build /app/action-model ./action-model
COPY --from=build /app/fixtures ./fixtures
USER node
EXPOSE 8080
CMD ["npm", "start"]
