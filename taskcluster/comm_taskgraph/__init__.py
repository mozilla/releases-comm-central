# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

import os
import logging
from importlib import import_module

from taskgraph import GECKO
from taskgraph.util.partials import populate_release_history
from taskgraph.optimize.schema import set_optimization_schema
from comm_taskgraph.optimize import thunderbird_optimizations

logger = logging.getLogger(__name__)

COMM = os.path.join(GECKO, "comm")
COMM_SCRIPTS = os.path.join(COMM, "taskcluster", "scripts")

BALROG_PRODUCT = "Thunderbird"


def register(graph_config):
    """
    Import all modules that are siblings of this one, triggering decorators in
    the process.
    """
    logger.info("{} path registered".format(__name__))
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


def get_decision_parameters(graph_config, parameters):
    logger.info("{}.get_decision_parameters called".format(__name__))
    # If the target method is nightly, we should build partials. This means
    # knowing what has been released previously.
    # An empty release_history is fine, it just means no partials will be built
    project = parameters["project"]

    parameters.setdefault("release_history", dict())
    if "nightly" in parameters.get("target_tasks_method", ""):
        parameters["release_history"] = populate_release_history(
            BALROG_PRODUCT, project
        )
