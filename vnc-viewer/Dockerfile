FROM ghcr.io/home-assistant/base-debian:bookworm AS NO_VNC

RUN apt-get update && apt-get -y --no-install-recommends install \
    git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN git config --global advice.detachedHead false && \
    git clone https://github.com/novnc/noVNC.git -b v1.5.0 /noVNC

FROM ghcr.io/home-assistant/base-debian:bookworm AS WEBSOCKIFY

RUN apt-get update && apt-get -y --no-install-recommends install \
    git \
    python3 \
    python3-setuptools \
    python3-numpy \
    python3-pip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages --no-cache-dir Cython==0.29.32

# hadolint ignore=DL3003
RUN git config --global advice.detachedHead false && \
    git clone https://github.com/novnc/websockify -b v0.10.0 /websockify && \
    cd /websockify && python3 setup.py install

FROM ghcr.io/home-assistant/base-debian:bookworm AS RUNNING

RUN apt-get update && apt-get -y --no-install-recommends install \
    git \
    python3 \
    python3-setuptools \
    python3-numpy \
    procps \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=NO_VNC /noVNC /noVNC
COPY --from=WEBSOCKIFY /usr/local/lib/python3.11/dist-packages/ /usr/local/lib/python3.11/dist-packages/
COPY --from=WEBSOCKIFY /usr/local/bin/websockify /usr/local/bin/websockify
COPY dashboard /noVNC/

ENTRYPOINT [ "/init" ]
CMD []
COPY root /
