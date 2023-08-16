FROM $DOCKER_IMAGE_PARENT
MAINTAINER Thunderbird Releng <tb-builds@thunderbird.net>

VOLUME /builds/worker/workspace

COPY atn_langpack.py /builds/worker/bin/atn_langpack.py
COPY make_venv.sh /builds/worker/bin/make_venv.sh
COPY runme.sh /builds/worker/bin/runme.sh
COPY requirements.txt /builds/worker/requirements.txt

RUN /builds/worker/bin/make_venv.sh

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]

