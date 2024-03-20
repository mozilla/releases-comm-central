# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Support for optimizing tasks based on the set of files that have changed.
"""

import logging

from taskgraph.util.path import join as join_path

from gecko_taskgraph.files_changed import (
    get_changed_files as gecko_get_changed_files,
)
from gecko_taskgraph.files_changed import get_locally_changed_files
from mozbuild.util import memoize

from comm_taskgraph import COMM

logger = logging.getLogger(__name__)


def prefix_paths(_changed, prefix):
    return {join_path(prefix, file) for file in _changed}


@memoize
def get_changed_files(repository, revision, prefix=None):
    """
    Enhanced version of gecko_taskgraph's get_changed_files that allows
    prefixing files with a path such as "comm/".
    """
    _changed = gecko_get_changed_files(repository, revision)
    if prefix is None:
        return _changed
    if not _changed and prefix is not None:
        # Handle case where gecko_changed_files resorted to local lookup for comm/ subdir
        # This will return a bogus empty set, so check again for real
        _changed = get_locally_changed_files(COMM)
    return prefix_paths(_changed, prefix)
