#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Thunderbird specific taskgraph optimizers.
"""

from __future__ import absolute_import, print_function, unicode_literals

import logging

from six import text_type

from taskgraph.optimize import (
    register_strategy,
    Any,
    OptimizationStrategy,
)
from taskgraph.optimize.schema import (
    default_optimizations,
)
from mozbuild.util import memoize
from mozpack.path import match as mozpackmatch
from taskgraph.files_changed import get_changed_files

logger = logging.getLogger(__name__)


def is_excluded(check_path, file_patterns):
    for pattern in file_patterns:
        if mozpackmatch(check_path, pattern):
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
        file for file in get_changed_files(repository, revision) if not is_suite(file)
    }


@register_strategy("skip-suite-only")
class SkipSuiteOnly(OptimizationStrategy):
    def should_remove_task(self, task, params, arg):
        # pushlog_id == -1 - this is the case when run from a cron.yml job
        if params.get("pushlog_id") == -1:
            return False

        repository = params.get("comm_head_repository")
        revision = params.get("comm_head_rev")
        non_suite_changed_files = get_non_suite_changed_files(repository, revision)
        # non_suite_changed_files will be an empty set (Falsy) for suite-only pushes
        # so "skip" this task
        if not non_suite_changed_files:
            return True
        return False


register_strategy(
    "skip-unless-backstop-no-suite", args=("skip-unless-backstop", "skip-suite-only")
)(Any)

register_strategy(
    "skip-unless-changed-no-suite", args=("skip-unless-changed", "skip-suite-only")
)(Any)

optimizations = (
    {"skip-suite-only": None},
    {"skip-unless-backstop-no-suite": None},
    {"skip-unless-changed-no-suite": [text_type]},
)

thunderbird_optimizations = default_optimizations + optimizations
