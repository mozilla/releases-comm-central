#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging

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

logger = logging.getLogger(__name__)


# Called at import time when comm_taskgraph:register is called
comm_parameters_schema.update(
    {
        Required("comm_base_repository"): str,
        Required("comm_base_ref"): str,
        Required("comm_base_rev"): str,
        Required("comm_head_ref"): str,
        Required("comm_head_repository"): str,
        Required("comm_head_rev"): str,
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
