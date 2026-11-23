FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/workspace \
    TERM=xterm-256color

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -g 1000 sandbox \
  && useradd -m -u 1000 -g 1000 -s /bin/bash sandbox \
  && mkdir -p /workspace \
  && chown -R sandbox:sandbox /workspace

WORKDIR /workspace
USER sandbox

CMD ["/bin/sh", "-c", "while sleep 3600; do :; done"]
