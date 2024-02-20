FROM $DOCKER_IMAGE_PARENT
MAINTAINER Rob Lemley <rob@thunderbird.net>

VOLUME /builds/worker/checkouts


COPY    privileged-setup.sh     /setup/privileged-setup.sh
COPY    setup.sh                /builds/worker/setup.sh
COPY    requirements.txt        /builds/worker/requirements.txt
COPY    hgrc                    /etc/mercurial/hgrc.d/updatebot.rc
COPY    vendor/                 /builds/worker/vendor/
COPY    moz-phab-config         /builds/worker/.moz-phab-config

# %include comm/taskcluster/docker/recipes/make_venv.sh
COPY topsrcdir/comm/taskcluster/docker/recipes/make_venv.sh /builds/worker/make_venv.sh

RUN     cd /setup && ./privileged-setup.sh

ENV     HOME                /builds/worker
ENV     SHELL               /bin/bash
ENV     USER                worker
ENV     LOGNAME             worker
ENV     PYTHONUNBUFFERED    1
ENV     PATH                "/builds/worker/fetches/rustc/bin:/builds/worker/fetches/cargo-vet:/builds/worker/bin:${PATH}"

RUN     cd /builds/worker && su -p worker -c ./setup.sh
