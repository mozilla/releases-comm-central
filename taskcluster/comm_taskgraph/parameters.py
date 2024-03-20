#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging

from taskgraph.parameters import extend_parameters_schema
from taskgraph.util.path import join
from voluptuous import Required

from gecko_taskgraph.files_changed import get_locally_changed_files
from gecko_taskgraph.parameters import gecko_parameters_schema as comm_parameters_schema
from gecko_taskgraph.parameters import get_app_version, get_version

from comm_taskgraph.files_changed import prefix_paths

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
        Required("comm_src_path"): str,
    }
)


def get_defaults(repo_root=None):
    changed_files = set()
    if repo_root is not None:
        changed_files = sorted(
            prefix_paths(get_locally_changed_files(repo_root), repo_root)
            | get_locally_changed_files(join(repo_root, ".."))
        )
    return {
        "app_version": get_app_version(product_dir="comm/mail"),
        "version": get_version("comm/mail"),
        "comm_src_path": "comm/",
        "files_changed": changed_files,
    }


def register_parameters():
    """Register the additional comm_* parameters with taskgraph. Note that
    defaults_fn is registered, but it does not actually run by design in the
    decision task due to 'strict' being True in that case."""
    extend_parameters_schema(comm_parameters_schema, defaults_fn=get_defaults)
