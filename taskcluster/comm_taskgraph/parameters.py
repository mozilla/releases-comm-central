#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
from typing import Optional

from taskgraph.parameters import extend_parameters_schema
from taskgraph.util.path import join

from gecko_taskgraph.files_changed import get_locally_changed_files
from gecko_taskgraph.parameters import GeckoParametersSchema, get_app_version, get_version

from comm_taskgraph.files_changed import prefix_paths

logger = logging.getLogger(__name__)


class CommParametersSchema(GeckoParametersSchema, kw_only=True, rename=None):
    comm_base_repository: str
    comm_base_ref: Optional[str]
    comm_base_rev: str
    comm_head_ref: str
    comm_head_repository: str
    comm_head_rev: str
    comm_src_path: str
    message: str
    try_options: Optional[dict]


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
        "try_options": None,
    }


def register_parameters():
    """Register the additional comm_* parameters with taskgraph. Note that
    defaults_fn is registered, but it does not actually run by design in the
    decision task due to 'strict' being True in that case."""
    extend_parameters_schema(CommParametersSchema, defaults_fn=get_defaults)
