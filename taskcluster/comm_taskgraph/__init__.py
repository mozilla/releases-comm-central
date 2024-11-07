# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import os
import sys
from importlib import import_module

from gecko_taskgraph import GECKO
from gecko_taskgraph.optimize.schema import set_optimization_schema  # noqa: F401

from comm_taskgraph.optimize import thunderbird_optimizations

logger = logging.getLogger(__name__)

COMM = os.path.join(GECKO, "comm")
COMM_SCRIPTS = os.path.join(COMM, "taskcluster", "scripts")


def extend_sys_path(topsrcdir):
    from mach.requirements import MachEnvRequirements

    requirements = MachEnvRequirements.from_requirements_definition(
        topsrcdir,
        True,  # is_thunderbird
        False,
        os.path.join(topsrcdir, "comm/python/sites/tb_common.txt"),
    )
    extend_path = [
        os.path.normcase(os.path.join(topsrcdir, pth.path))
        for pth in requirements.pth_requirements
    ]
    sys.path.extend(extend_path)


def register(graph_config):
    """
    Import all modules that are siblings of this one, triggering decorators in
    the process.
    """
    extend_sys_path(GECKO)
    from gecko_taskgraph.util import dependencies  # noqa: trigger group_by registration

    from comm_taskgraph.parameters import register_parameters
    from comm_taskgraph.util import taskgraph_attributes  # noqa: patch gecko_taskgraph

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
