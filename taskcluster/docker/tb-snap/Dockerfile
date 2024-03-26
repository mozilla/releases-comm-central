# /!\ The base image must follow the version of the `coreXX` package
# https://forum.snapcraft.io/t/issues-dockerizing-a-snapcraft-build-process/30294/5
FROM ubuntu:jammy
MAINTAINER daniel@thunderbird.net
    
# Install dependencies and generate locales
RUN apt-get update && \
    apt-get dist-upgrade --yes && \
    apt-get install --yes \
      curl \
      jq \
      squashfs-tools \
      locales \
      bzip2 \
      git \
      python3 \
      python3-venv \
      locales \
      snapd \
      sudo \
      && \
    locale-gen "en_US.UTF-8"

# Set environment variables
ENV LANG="en_US.UTF-8" \
    LANGUAGE="en_US:en" \
    LC_ALL="en_US.UTF-8" \
    VENV_DIR="/scripts" \
    SNAP="/snap/snapcraft/current" \
    SNAP_NAME="snapcraft" \
    SNAP_ARCH="amd64" \
    SNAP_LIST="core22 snapcraft gnome-42-2204" \
    SNAP_VERSION=""
ENV PATH="$SNAP/bin:$PATH"

# Install required snaps
COPY install_snap.sh .
RUN for snap in $SNAP_LIST; do ./install_snap.sh "${snap}"; done

# Create scripts directory
RUN mkdir /scripts/
WORKDIR /scripts/

# Copy everything in the docker/tb-snap folder but the Dockerfile
COPY [^D]* /scripts/

# Copy required recipes
# %include comm/taskcluster/docker/recipes
COPY topsrcdir/comm/taskcluster/docker/recipes/make_venv.sh /scripts/make_venv.sh
COPY topsrcdir/comm/taskcluster/docker/recipes/fluent_requirements.txt /scripts/fluent_requirements.txt
COPY topsrcdir/comm/taskcluster/docker/recipes/build_desktop_file.py /scripts/build_desktop_file.py
COPY topsrcdir/comm/taskcluster/docker/recipes/org.mozilla.thunderbird.desktop.jinja2 /scripts/org.mozilla.thunderbird.desktop.jinja2

# Set up Python virtual environment
RUN /scripts/make_venv.sh /scripts/fluent_requirements.txt

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]
