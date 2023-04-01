FROM freedesktopsdk/flatpak:21.08-x86_64
MAINTAINER tb-builds@thunderbird.net

RUN mkdir /scripts/
WORKDIR /scripts/

# Copy everything in the docker/thunderbird-flatpak folder but the Dockerfile
COPY [^D]* /scripts/

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]
