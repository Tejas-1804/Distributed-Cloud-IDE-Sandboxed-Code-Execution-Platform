FROM eclipse-temurin:21-jdk

ENV HOME=/workspace \
    TERM=xterm-256color

RUN groupadd -g 1000 sandbox || true \
  && useradd -m -u 1000 -g 1000 -s /bin/bash sandbox || true \
  && mkdir -p /workspace \
  && chown -R 1000:1000 /workspace

WORKDIR /workspace
USER 1000:1000

CMD ["/bin/sh", "-c", "while sleep 3600; do :; done"]
