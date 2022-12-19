# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import os
from importlib import import_module

from gecko_taskgraph import GECKO
from gecko_taskgraph.optimize.schema import set_optimization_schema  # noqa: F401

from comm_taskgraph.optimize import thunderbird_optimizations

logger = logging.getLogger(__name__)

COMM = os.path.join(GECKO, "comm")
COMM_SCRIPTS = os.path.join(COMM, "taskcluster", "scripts")


def register(graph_config):
    """
    Import all modules that are siblings of this one, triggering decorators in
    the process.
    """
    from comm_taskgraph.parameters import register_parameters

    logger.info("{} path registered".format(__name__))
    register_parameters()

    set_optimization_schema(thunderbird_optimizations)

    _import_modules(
        [
            "documentation",
            "util.docker",
            "actions",
            "target_tasks",
            "transforms.job.toolchain",
        ]
    )


def _import_modules(modules):
    for module in modules:
        import_module(".{}".format(module), package=__name__)
