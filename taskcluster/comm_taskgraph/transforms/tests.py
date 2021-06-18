#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Thunderbird modifications to test jobs
"""

from __future__ import absolute_import, print_function, unicode_literals

from taskgraph.transforms.base import TransformSequence

from taskgraph.util.schema import resolve_keyed_by

import logging

logger = logging.getLogger(__name__)

transforms = TransformSequence()


@transforms.add
def optimization_keyed_by(config, tasks):
    """Used to set the optimization strategy"""
    for task in tasks:
        resolve_keyed_by(task, "optimization", item_name=task["test-name"])
        yield task
