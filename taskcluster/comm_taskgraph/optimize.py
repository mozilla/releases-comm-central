#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Thunderbird specific taskgraph optimizers.
"""

import logging

from taskgraph.optimize.base import register_strategy

from gecko_taskgraph.optimize.mozlint import SkipUnlessMozlint
from gecko_taskgraph.optimize.schema import default_optimizations

logger = logging.getLogger(__name__)

# Register "skip-unless-mozlint" with the correct mozlint path.
register_strategy("skip-unless-mozlint", args=("comm/tools/lint",))(SkipUnlessMozlint)

# Currently no Thunderbird-specific optimization strategies. Keep for future
# reference.
# optimizations = (
#    {"skip-suite-only": None},
# )

optimizations = ()
thunderbird_optimizations = default_optimizations + optimizations
