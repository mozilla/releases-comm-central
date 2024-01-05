#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

import fnmatch
import logging

from gecko_taskgraph.target_tasks import (
    filter_by_uncommon_try_tasks,
    filter_unsupported_artifact_builds,
)
from gecko_taskgraph.try_option_syntax import TryOptionSyntax

logger = logging.getLogger(__name__)


class TryCCOptionSyntax(TryOptionSyntax):
    """
    Override parse_platforms in the superclass. Removed the attempt to replace
    macosx64 jobs with macosx64-shippable.
    """

    def parse_platforms(self, options, full_task_graph):
        platform_arg = options["platforms"]
        if platform_arg == "all":
            return None

        test_platforms = {
            t.attributes["test_platform"]
            for t in full_task_graph.tasks.values()
            if "test_platform" in t.attributes
        }
        build_platforms = {
            t.attributes["build_platform"]
            for t in full_task_graph.tasks.values()
            if "build_platform" in t.attributes
        }

        results = []
        for build in platform_arg.split(","):
            if build.startswith("*"):
                matching = fnmatch.filter(build_platforms, build)
                results.extend(matching)
                continue
            results.append(build)

        all_platforms = test_platforms | build_platforms
        bad_platforms = set(results) - all_platforms
        if bad_platforms:
            raise Exception("Unknown platform(s) [%s] specified for try" % ",".join(bad_platforms))

        return results


def _try_cc_option_syntax(full_task_graph, parameters, graph_config):
    """Generate a list of target tasks based on try syntax in
    parameters['message'] and, for context, the full task graph.

    Based on gecko_taskgraph.target_tasks._try_option_syntax. Removed talos
    and raptor references and use TryCCOptionSyntax.
    """
    options = TryCCOptionSyntax(parameters, full_task_graph, graph_config)
    target_tasks_labels = [
        t.label
        for t in full_task_graph.tasks.values()
        if options.task_matches(t)
        and filter_by_uncommon_try_tasks(t.label)
        and filter_unsupported_artifact_builds(t, parameters)
    ]

    attributes = {
        k: getattr(options, k)
        for k in [
            "no_retry",
            "tag",
        ]
    }

    for l in target_tasks_labels:
        task = full_task_graph[l]
        if "unittest_suite" in task.attributes:
            task.attributes["task_duplicates"] = options.trigger_tests

    for l in target_tasks_labels:
        task = full_task_graph[l]
        # If the developer wants test jobs to be rebuilt N times we add that value here
        if options.trigger_tests > 1 and "unittest_suite" in task.attributes:
            task.attributes["task_duplicates"] = options.trigger_tests

        task.attributes.update(attributes)

    # Add notifications here as well
    if options.notifications:
        for task in full_task_graph:
            owner = parameters.get("owner")
            routes = task.task.setdefault("routes", [])
            if options.notifications == "all":
                routes.append(f"notify.email.{owner}.on-any")
            elif options.notifications == "failure":
                routes.append(f"notify.email.{owner}.on-failed")
                routes.append(f"notify.email.{owner}.on-exception")

    return target_tasks_labels
