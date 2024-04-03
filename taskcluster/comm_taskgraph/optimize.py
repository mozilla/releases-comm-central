#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Thunderbird specific taskgraph optimizers.
"""

import logging

from taskgraph.optimize.base import OptimizationStrategy, register_strategy
from taskgraph.util.path import join as join_path
from taskgraph.util.path import match as match_path
from taskgraph.util.yaml import load_yaml
from voluptuous import Optional, Required

from gecko_taskgraph import GECKO
from gecko_taskgraph.optimize.schema import default_optimizations
from mozlint.pathutils import filterpaths

logger = logging.getLogger(__name__)


@register_strategy("skip-unless-mozlint")
class SkipUnlessMozlint(OptimizationStrategy):
    schema = {
        "root-path": Optional(str),
        "mozlint-config": Required(str),
    }

    def should_remove_task(self, task, params, args):
        include = []
        exclude = []
        extensions = []
        support_files = []

        root_path = join_path(GECKO, args.get("root-path", ""))
        mozlint_root = join_path(root_path, "tools", "lint")
        mozlint_yaml = join_path(mozlint_root, args["mozlint-config"])

        logger.info(f"Loading file patterns for {task.label} from {mozlint_yaml}.")
        linter_config = load_yaml(mozlint_yaml)
        for check, config in linter_config.items():
            include += config.get("include", [])
            exclude += config.get("exclude", [])
            extensions += [e.strip(".") for e in config.get("extensions", [])]
            support_files += config.get("support-files", [])

        changed_files = params["files_changed"]

        # Support files may not be part of "include" patterns, so check first
        # Do not remove (return False) if any changed
        for pattern in support_files:
            for path in changed_files:
                if match_path(path, pattern):
                    return False

        to_lint, to_exclude = filterpaths(
            GECKO,
            list(changed_files),
            include=include,
            exclude=exclude,
            extensions=extensions,
        )

        # to_lint should be an empty list if there is nothing to check
        if not to_lint:
            return True
        return False


optimizations = ({"skip-unless-mozlint": SkipUnlessMozlint.schema},)

thunderbird_optimizations = default_optimizations + optimizations
