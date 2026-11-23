FROM node:20-alpine

ENV NODE_ENV=development \
    HOME=/workspace \
    TERM=xterm-256color

RUN apk add --no-cache bash \
  && mkdir -p /workspace \
  && chown -R node:node /workspace

WORKDIR /workspace
USER node

CMD ["/bin/sh", "-c", "while sleep 3600; do :; done"]
