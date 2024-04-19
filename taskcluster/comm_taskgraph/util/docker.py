# -*- coding: utf-8 -*-
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import os

from gecko_taskgraph.util import docker as utildocker

from .. import COMM

logger = logging.getLogger(__name__)

COMM_IMAGE_DIR = os.path.join(COMM, "taskcluster", "docker")


def register():
    logger.info("Registering comm docker image definition path.")
    utildocker.image_paths.register(
        "comm/taskcluster/kinds/docker-image/docker-image.yml", COMM_IMAGE_DIR
    )


register()
