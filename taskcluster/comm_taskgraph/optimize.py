#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Thunderbird specific taskgraph optimizers.
"""

import logging

from taskgraph.optimize.base import Any, OptimizationStrategy, register_strategy
from taskgraph.util.memoize import memoize
from taskgraph.util.path import join as join_path
from taskgraph.util.path import match as match_path
from taskgraph.util.yaml import load_yaml
from voluptuous import Optional, Required

from gecko_taskgraph import GECKO
from gecko_taskgraph.optimize.schema import default_optimizations
from mozlint.pathutils import filterpaths

from comm_taskgraph import files_changed

logger = logging.getLogger(__name__)


def is_excluded(check_path, file_patterns):
    for pattern in file_patterns:
        if match_path(check_path, pattern):
            return True
    return False


def is_suite(check_path):
    suite_patterns = ("editor", "suite")
    return is_excluded(check_path, suite_patterns)


@memoize
def get_non_suite_changed_files(repository, revision):
    """
    Returns the list of changed files from comm- repository (no prefixing)
    with suite/** and editor/** files removed.
    """
    return {
        file
        for file in files_changed.get_changed_files(repository, revision)
        if not is_suite(file)
    }


@register_strategy("comm-skip-unless-changed")
class SkipUnlessChanged(OptimizationStrategy):
    def should_remove_task(self, task, params, file_patterns):
        # pushlog_id == -1 - this is the case when run from a cron.yml job
        if params.get("pushlog_id") == -1:
            return False

        changed = files_changed.check(params, file_patterns)
        if not changed:
            logger.debug(
                "no files found matching a pattern in `skip-unless-changed` for " + task.label
            )
            return True
        return False


@register_strategy("skip-suite-only")
class SkipSuiteOnly(OptimizationStrategy):
    def should_remove_task(self, task, params, arg):
        # pushlog_id == -1 - this is the case when run from a cron.yml job
        if params.get("pushlog_id") == -1:
            return False

        if params.get("project") == "try-comm-central":
            # Do not try to use this optimization on try-c-c builds
            return False

        repository = params.get("comm_head_repository")
        revision = params.get("comm_head_rev")
        non_suite_changed_files = get_non_suite_changed_files(repository, revision)
        # non_suite_changed_files will be an empty set (Falsy) for suite-only pushes
        # so "skip" this task
        if not non_suite_changed_files:
            return True
        return False


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

        changed_files = files_changed.get_files_changed_extended(params)

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


register_strategy(
    "skip-unless-backstop-no-suite", args=("skip-unless-backstop", "skip-suite-only")
)(Any)

register_strategy(
    "skip-unless-changed-no-suite", args=("comm-skip-unless-changed", "skip-suite-only")
)(Any)

optimizations = (
    {"skip-suite-only": None},
    {"skip-unless-backstop-no-suite": None},
    {"skip-unless-changed-no-suite": [str]},
    {"skip-unless-mozlint": SkipUnlessMozlint.schema},
)

thunderbird_optimizations = default_optimizations + optimizations
