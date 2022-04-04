# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

import sys
import os
import logging
from importlib import import_module

from gecko_taskgraph import GECKO
from comm_taskgraph.optimize import thunderbird_optimizations
from gecko_taskgraph.optimize.schema import set_optimization_schema  # noqa: F401

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

    # set_optimization_schema(thunderbird_optimizations)   -- bug 1762712
    try:
        task_m = sys.modules["gecko_taskgraph.transforms.task"]
    except KeyError:
        from gecko_taskgraph.transforms import task  # noqa: F401

        task_m = sys.modules["gecko_taskgraph.transforms.task"]

    task_m.OptimizationSchema.validators = thunderbird_optimizations

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
