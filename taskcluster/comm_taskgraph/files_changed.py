# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Support for optimizing tasks based on the set of files that have changed.
"""

import logging

from taskgraph.util.path import join as join_path

logger = logging.getLogger(__name__)


def prefix_paths(_changed, prefix):
    return {join_path(prefix, file) for file in _changed}
