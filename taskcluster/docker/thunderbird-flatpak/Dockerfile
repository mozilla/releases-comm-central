FROM freedesktopsdk/flatpak:22.08-x86_64
MAINTAINER tb-builds@thunderbird.net

RUN mkdir /scripts/
WORKDIR /scripts/

# Copy everything in the docker/thunderbird-flatpak folder but the Dockerfile
COPY [^D]* /scripts/

RUN /scripts/make_venv.sh

RUN ["gcc", "-Wall", "-shared", "-o", "/scripts/close_range.so", "/scripts/close_range.c"]

ENV LD_PRELOAD /scripts/close_range.so

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]
