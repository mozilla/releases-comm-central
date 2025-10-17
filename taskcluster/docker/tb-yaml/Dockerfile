FROM $DOCKER_IMAGE_PARENT
MAINTAINER Thunderbird Releng <tb-builds@thunderbird.net>
# This image is used to parse YAML files

VOLUME /builds/worker/checkouts
VOLUME /builds/worker/workspace

RUN apt-get update && \
    apt-get dist-upgrade && \
    apt-get install \
      python3-yaml
