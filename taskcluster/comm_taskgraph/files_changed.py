# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Support for optimizing tasks based on the set of files that have changed.
"""

import logging

from taskgraph.util.path import join as join_path
from taskgraph.util.path import match as match_path

from gecko_taskgraph.files_changed import get_changed_files

logger = logging.getLogger(__name__)


def get_files_changed_extended(params):
    """
    Get the set of files changed in the push head from possibly multiple
    head_repositories.
    """
    changed_files = set()

    repo_keys = [key for key in params.keys() if key.endswith("head_repository")]

    def prefix_changed(_changed, prefix):
        if not prefix:
            return _changed
        else:
            return {join_path(prefix, file) for file in _changed}

    for repo_key in repo_keys:
        repo_prefix = repo_key.replace("head_repository", "")
        rev_key = f"{repo_prefix}head_rev"
        repo_subdir_key = f"{repo_prefix}src_path"

        repository = params.get(repo_key)
        revision = params.get(rev_key)
        repo_subdir = params.get(repo_subdir_key, "")

        if not repository or not revision:
            logger.warning(
                f"Missing `{repo_key}` or `{rev_key}` parameters; "
                "assuming all files have changed"
            )
            return True

        changed_files |= prefix_changed(get_changed_files(repository, revision), repo_subdir)

    return changed_files


def check(params, file_patterns):
    """Determine whether any of the files changed in the indicated push to
    https://hg.mozilla.org match any of the given file patterns."""
    changed_files = get_files_changed_extended(params)
    if not changed_files:
        logger.warning(
            "changed_files from automationrelevance is empty; assuming all files have changed"
        )
        return True

    for pattern in file_patterns:
        for path in changed_files:
            if match_path(path, pattern):
                return True

    return False
