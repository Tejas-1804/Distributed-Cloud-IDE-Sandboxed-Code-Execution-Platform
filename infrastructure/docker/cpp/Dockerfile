FROM gcc:13

ENV HOME=/workspace \
    TERM=xterm-256color

RUN groupadd -g 1000 sandbox \
  && useradd -m -u 1000 -g 1000 -s /bin/bash sandbox \
  && mkdir -p /workspace \
  && chown -R sandbox:sandbox /workspace

WORKDIR /workspace
USER sandbox

CMD ["/bin/sh", "-c", "while sleep 3600; do :; done"]
