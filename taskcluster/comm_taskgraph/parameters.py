#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

import logging

from six import text_type
from voluptuous import (
    Required,
)

from taskgraph.parameters import extend_parameters_schema
from gecko_taskgraph.parameters import (
    gecko_parameters_schema as comm_parameters_schema,
    get_app_version,
    get_defaults as get_gecko_defaults,
    get_version,
)
from gecko_taskgraph.util.partials import populate_release_history
from gecko_taskgraph.util.backstop import is_backstop

logger = logging.getLogger(__name__)

BALROG_PRODUCT = "Thunderbird"

PER_PROJECT_PARAMETERS = {
    "jamun": {
        "target_tasks_method": "nightly_desktop",
        "release_type": "nightly",
    },
    "try-comm-central": {
        "target_tasks_method": "try_tasks",
    },
    "comm-central": {
        "target_tasks_method": "comm_central_tasks",
        "release_type": "nightly",
    },
    "comm-beta": {
        "target_tasks_method": "mozilla_beta_tasks",
        "release_type": "beta",
    },
    "comm-esr91": {
        "target_tasks_method": "mozilla_esr91_tasks",
        "release_type": "release",
    },
}

# Backstop defaults
BACKSTOP_TIME_INTERVAL = 60 * 22  # minutes
INTEGRATION_PROJECTS = {"comm-central"}


# Called at import time when comm_taskgraph:register is called
comm_parameters_schema.update(
    {
        Required("comm_base_repository"): text_type,
        Required("comm_head_ref"): text_type,
        Required("comm_head_repository"): text_type,
        Required("comm_head_rev"): text_type,
    }
)


def get_defaults(repo_root=None):
    defaults = get_gecko_defaults(repo_root)
    defaults.update(
        {
            "app_version": get_app_version(product_dir="comm/mail"),
            "version": get_version("comm/mail"),
        }
    )
    return defaults


def register_parameters():
    extend_parameters_schema(comm_parameters_schema, defaults_fn=get_defaults)


def get_decision_parameters(graph_config, parameters):
    logger.info("{}.get_decision_parameters called".format(__name__))

    # If the target method is nightly, we should build partials. This means
    # knowing what has been released previously.
    # An empty release_history is fine, it just means no partials will be built
    project = parameters["project"]

    if project in PER_PROJECT_PARAMETERS:
        # Upstream will set target_tasks_method to "default" when nothing is set
        if parameters["target_tasks_method"] == "default":
            del parameters["target_tasks_method"]

        # If running from .cron.yml, do not overwrite existing parameters
        update_parameters = [
            (_k, _v)
            for _k, _v in PER_PROJECT_PARAMETERS[project].items()
            if _k not in parameters or not parameters[_k]
        ]
        parameters.update(update_parameters)
    else:
        # Projects without a target_tasks_method should not exist for Thunderbird CI
        raise Exception(
            "No target_tasks_method is defined for project {}.".format(project)
        )

    parameters.setdefault("release_history", dict())
    if "nightly" in parameters.get("target_tasks_method", ""):
        parameters["release_history"] = populate_release_history(
            BALROG_PRODUCT, project
        )

    del parameters["backstop"]
    parameters["backstop"] = is_backstop(
        parameters,
        trust_domain="comm",
        time_interval=BACKSTOP_TIME_INTERVAL,
        integration_projects=INTEGRATION_PROJECTS,
    )
