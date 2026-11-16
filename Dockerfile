FROM node:24.16.0-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --cache /tmp/npm-cache && rm -rf /tmp/npm-cache
COPY --chown=node:node packages ./packages
COPY --chown=node:node services ./services
COPY --chown=node:node integrations ./integrations
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "--import", "tsx", "services/orchestrator/server.ts"]
