#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse
import copy
import fnmatch
import logging
import re
import shlex
from collections import defaultdict

from gecko_taskgraph.target_tasks import (
    filter_by_uncommon_try_tasks,
    filter_unsupported_artifact_builds,
)

logger = logging.getLogger(__name__)

# The build type aliases are very cryptic and only used in try flags these are
# mappings from the single char alias to a longer more recognizable form.
BUILD_TYPE_ALIASES = {"o": "opt", "d": "debug"}

# consider anything in this allow list of kinds to be governed by -b/-p
BUILD_KINDS = {
    "build",
    "artifact-build",
}


# mapping from shortcut name (usable with -u) to a boolean function identifying
# matching test names
def alias_prefix(prefix):
    return lambda name: name.startswith(prefix)


def alias_contains(infix):
    return lambda name: infix in name


def alias_matches(pattern):
    pattern = re.compile(pattern)
    return lambda name: pattern.match(name)


UNITTEST_ALIASES = {
    # Aliases specify shorthands that can be used in try syntax.  The shorthand
    # is the dictionary key, with the value representing a pattern for matching
    # unittest_try_names.
    #
    # Note that alias expansion is performed in the absence of any chunk
    # prefixes.  For example, the first example above would replace "foo-7"
    # with "foobar-7".  Note that a few aliases allowed chunks to be specified
    # without a leading `-`, for example 'mochitest-dt1'. That's no longer
    # supported.
    "gtest": alias_prefix("gtest"),
    "marionette": alias_prefix("marionette"),
    "mochitest": alias_prefix("mochitest"),
    "mochitests": alias_prefix("mochitest"),
    "mochitest-bc": alias_prefix("mochitest-browser-chrome"),
    "xpcshell": alias_prefix("xpcshell"),
}

# unittest platforms can be specified by substring of the "pretty name", which
# is basically the old Buildbot builder name.  This dict has {pretty name,
# [test_platforms]} translations, This includes only the most commonly-used
# substrings.  It is OK to add new test platforms to various shorthands here;
# if you add a new Linux64 test platform for instance, people will expect that
# their previous methods of requesting "all linux64 tests" will include this
# new platform, and they shouldn't have to explicitly spell out the new platform
# every time for such cases.
#
# Note that the test platforms here are only the prefix up to the `/`.
UNITTEST_PLATFORM_PRETTY_NAMES = {
    "Ubuntu": [
        "linux64",
        "linux64-asan",
        "linux1804-64",
        "linux1804-64-asan",
    ],
    "x64": ["linux64", "linux64-asan", "linux1804-64", "linux1804-64-asan"],
    "Windows 10": ["windows10-64"],
}

TEST_CHUNK_SUFFIX = re.compile("(.*)-([0-9]+)$")


def escape_whitespace_in_brackets(input_str):
    """
    In tests you may restrict them by platform [] inside of the brackets
    whitespace may occur this is typically invalid shell syntax so we escape it
    with backslash sequences    .
    """
    result = ""
    in_brackets = False
    for char in input_str:
        if char == "[":
            in_brackets = True
            result += char
            continue

        if char == "]":
            in_brackets = False
            result += char
            continue

        if char == " " and in_brackets:
            result += r"\ "
            continue

        result += char

    return result


def split_try_msg(message):
    try:
        try_idx = message.index("try:")
    except ValueError:
        return []
    message = message[try_idx:].split("\n")[0]
    # shlex used to ensure we split correctly when giving values to argparse.
    return shlex.split(escape_whitespace_in_brackets(message))


def parse_message(message):
    parts = split_try_msg(message)

    # Argument parser based on try flag flags
    parser = argparse.ArgumentParser()
    parser.add_argument("-b", "--build", dest="build_types")
    parser.add_argument(
        "-p", "--platform", nargs="?", dest="platforms", const="all", default="all"
    )
    parser.add_argument(
        "-u", "--unittests", nargs="?", dest="unittests", const="all", default="all"
    )
    parser.add_argument(
        "-i", "--interactive", dest="interactive", action="store_true", default=False
    )
    parser.add_argument(
        "-e", "--all-emails", dest="notifications", action="store_const", const="all"
    )
    parser.add_argument(
        "-f",
        "--failure-emails",
        dest="notifications",
        action="store_const",
        const="failure",
    )
    parser.add_argument("-j", "--job", dest="jobs", action="append")
    parser.add_argument("--setenv", dest="env", action="append")
    parser.add_argument("--gecko-profile", dest="profile", action="store_true")
    parser.add_argument("--tag", dest="tag", action="store", default=None)
    parser.add_argument("--no-retry", dest="no_retry", action="store_true")
    parser.add_argument("--include-nightly", dest="include_nightly", action="store_true")
    parser.add_argument("--artifact", dest="artifact", action="store_true")

    # While we are transitioning from BB to TC, we want to push jobs to tc-worker
    # machines but not overload machines with every try push. Therefore, we add
    # this temporary option to be able to push jobs to tc-worker.
    parser.add_argument(
        "-w",
        "--taskcluster-worker",
        dest="taskcluster_worker",
        action="store_true",
        default=False,
    )

    # In order to run test jobs multiple times
    parser.add_argument("--rebuild", dest="trigger_tests", type=int, default=1)
    args, _ = parser.parse_known_args(parts)

    try_options = vars(args)
    try_task_config = {
        "use-artifact-builds": try_options.pop("artifact"),
        "gecko-profile": try_options.pop("profile"),
        "env": dict(arg.split("=") for arg in try_options.pop("env") or []),
    }
    return {
        "try_options": try_options,
        "try_task_config": try_task_config,
    }


class TryOptionSyntax:
    def __init__(self, parameters, full_task_graph, graph_config):
        """
        Apply the try options in parameters.

        The resulting object has attributes:

        - build_types: a list containing zero or more of 'opt' and 'debug'
        - platforms: a list of selected platform names, or None for all
        - unittests: a list of tests, of the form given below, or None for all
        - jobs: a list of requested job names, or None for all
        - trigger_tests: the number of times tests should be triggered (--rebuild)
        - interactive: true if --interactive
        - notifications: either None if no notifications or one of 'all' or 'failure'
        - tag: restrict tests to the specified tag
        - no_retry: do not retry failed jobs

        The unittests lists contain dictionaries of the form:

        {
            'test': '<suite name>',
            'platforms': [..platform names..], # to limit to only certain platforms
            'only_chunks': set([..chunk numbers..]), # to limit only to certain chunks
        }
        """
        self.full_task_graph = full_task_graph
        self.graph_config = graph_config
        self.jobs = []
        self.build_types = []
        self.platforms = []
        self.unittests = []
        self.trigger_tests = 0
        self.interactive = False
        self.notifications = None
        self.tag = None
        self.no_retry = False

        options = parameters["try_options"]
        if not options:
            return None
        self.jobs = self.parse_jobs(options["jobs"])
        self.build_types = self.parse_build_types(options["build_types"], full_task_graph)
        self.platforms = self.parse_platforms(options, full_task_graph)
        self.unittests = self.parse_test_option(
            "unittest_try_name", options["unittests"], full_task_graph
        )
        self.trigger_tests = options["trigger_tests"]
        self.interactive = options["interactive"]
        self.notifications = options["notifications"]
        self.tag = options["tag"]
        self.no_retry = options["no_retry"]
        self.include_nightly = options["include_nightly"]

        self.test_tiers = self.generate_test_tiers(full_task_graph)

    def generate_test_tiers(self, full_task_graph):
        retval = defaultdict(set)
        for t in full_task_graph.tasks.values():
            if t.attributes.get("kind") == "test":
                try:
                    tier = t.task["extra"]["treeherder"]["tier"]
                    name = t.attributes.get("unittest_try_name")
                    retval[name].add(tier)
                except KeyError:
                    pass

        return retval

    def parse_jobs(self, jobs_arg):
        if not jobs_arg or jobs_arg == ["none"]:
            return []  # default is `-j none`
        if jobs_arg == ["all"]:
            return None
        expanded = []
        for job in jobs_arg:
            expanded.extend(j.strip() for j in job.split(","))
        return expanded

    def parse_build_types(self, build_types_arg, full_task_graph):
        if build_types_arg is None:
            build_types_arg = []

        build_types = [
            _f
            for _f in (BUILD_TYPE_ALIASES.get(build_type) for build_type in build_types_arg)
            if _f
        ]

        all_types = {
            t.attributes["build_type"]
            for t in full_task_graph.tasks.values()
            if "build_type" in t.attributes
        }
        bad_types = set(build_types) - all_types
        if bad_types:
            raise Exception("Unknown build type(s) [%s] specified for try" % ",".join(bad_types))

        return build_types

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

    def parse_test_option(self, attr_name, test_arg, full_task_graph):
        """

        Parse a unittest (-u) option, in the context of a full task graph
        containing available `unittest_try_name` attributes.
        There are three cases:

            - test_arg is == 'none' (meaning an empty list)
            - test_arg is == 'all' (meaning use the list of jobs for that job type)
            - test_arg is comma string which needs to be parsed
        """

        # Empty job list case...
        if test_arg is None or test_arg == "none":
            return []

        all_platforms = {
            t.attributes["test_platform"].split("/")[0]
            for t in full_task_graph.tasks.values()
            if "test_platform" in t.attributes
        }

        tests = self.parse_test_opts(test_arg, all_platforms)

        if not tests:
            return []

        all_tests = {
            t.attributes[attr_name]
            for t in full_task_graph.tasks.values()
            if attr_name in t.attributes
        }

        # Special case where tests is 'all' and must be expanded
        if tests[0]["test"] == "all":
            results = []
            all_entry = tests[0]
            for test in all_tests:
                entry = {"test": test}
                # If there are platform restrictions copy them across the list.
                if "platforms" in all_entry:
                    entry["platforms"] = list(all_entry["platforms"])
                results.append(entry)
            return self.parse_test_chunks(all_tests, results)
        return self.parse_test_chunks(all_tests, tests)

    def parse_test_opts(self, input_str, all_platforms):
        """
        Parse `testspec,testspec,..`, where each testspec is a test name
        optionally followed by a list of test platforms or negated platforms in
        `[]`.

        No brackets indicates that tests should run on all platforms for which
        builds are available.  If testspecs are provided, then each is treated,
        from left to right, as an instruction to include or (if negated)
        exclude a set of test platforms.  A single spec may expand to multiple
        test platforms via UNITTEST_PLATFORM_PRETTY_NAMES.  If the first test
        spec is negated, processing begins with the full set of available test
        platforms; otherwise, processing begins with an empty set of test
        platforms.
        """

        # Final results which we will return.
        tests = []

        cur_test = {}
        token = ""
        in_platforms = False

        def normalize_platforms():
            if "platforms" not in cur_test:
                return
            # if the first spec is a negation, start with all platforms
            if cur_test["platforms"][0][0] == "-":
                platforms = all_platforms.copy()
            else:
                platforms = []
            for platform in cur_test["platforms"]:
                if platform[0] == "-":
                    platforms = [p for p in platforms if p != platform[1:]]
                else:
                    platforms.append(platform)
            cur_test["platforms"] = platforms

        def add_test(value):
            normalize_platforms()
            cur_test["test"] = value.strip()
            tests.insert(0, cur_test)

        def add_platform(value):
            platform = value.strip()
            if platform[0] == "-":
                negated = True
                platform = platform[1:]
            else:
                negated = False
            platforms = UNITTEST_PLATFORM_PRETTY_NAMES.get(platform, [platform])
            if negated:
                platforms = ["-" + p for p in platforms]
            cur_test["platforms"] = platforms + cur_test.get("platforms", [])

        # This might be somewhat confusing but we parse the string _backwards_ so
        # there is no ambiguity over what state we are in.
        for char in reversed(input_str):
            # , indicates exiting a state
            if char == ",":
                # Exit a particular platform.
                if in_platforms:
                    add_platform(token)

                # Exit a particular test.
                else:
                    add_test(token)
                    cur_test = {}

                # Token must always be reset after we exit a state
                token = ""
            elif char == "[":
                # Exiting platform state entering test state.
                add_platform(token)
                token = ""
                in_platforms = False
            elif char == "]":
                # Entering platform state.
                in_platforms = True
            else:
                # Accumulator.
                token = char + token

        # Handle any left over tokens.
        if token:
            add_test(token)

        return tests

    def handle_alias(self, test, all_tests):
        """
        Expand a test if its name refers to an alias, returning a list of test
        dictionaries cloned from the first (to maintain any metadata).
        """
        if test["test"] not in UNITTEST_ALIASES:
            return [test]

        alias = UNITTEST_ALIASES[test["test"]]

        def mktest(name):
            newtest = copy.deepcopy(test)
            newtest["test"] = name
            return newtest

        def exprmatch(alias):
            return [t for t in all_tests if alias(t)]

        return [mktest(t) for t in exprmatch(alias)]

    def parse_test_chunks(self, all_tests, tests):
        """
        Test flags may include parameters to narrow down the number of chunks in a
        given push. We don't model 1 chunk = 1 job in taskcluster so we must check
        each test flag to see if it is actually specifying a chunk.
        """
        results = []
        seen_chunks = {}
        for test in tests:
            matches = TEST_CHUNK_SUFFIX.match(test["test"])
            if matches:
                name = matches.group(1)
                chunk = matches.group(2)
                if name in seen_chunks:
                    seen_chunks[name].add(chunk)
                else:
                    seen_chunks[name] = {chunk}
                    test["test"] = name
                    test["only_chunks"] = seen_chunks[name]
                    results.append(test)
            else:
                results.extend(self.handle_alias(test, all_tests))

        # uniquify the results over the test names
        results = sorted(
            {test["test"]: test for test in results}.values(),
            key=lambda test: test["test"],
        )
        return results

    def find_all_attribute_suffixes(self, graph, prefix):
        rv = set()
        for t in graph.tasks.values():
            for a in t.attributes:
                if a.startswith(prefix):
                    rv.add(a[len(prefix) :])
        return sorted(rv)

    def task_matches(self, task):
        attr = task.attributes.get

        def check_run_on_projects():
            return {"all"} & set(attr("run_on_projects", []))

        def match_test(try_spec, attr_name):
            run_by_default = True
            if attr("build_type") not in self.build_types:
                return False

            if self.platforms is not None and attr("build_platform") not in self.platforms:
                return False
            if not check_run_on_projects():
                run_by_default = False

            if try_spec is None:
                return run_by_default

            # TODO: optimize this search a bit
            for test in try_spec:
                if attr(attr_name) == test["test"]:
                    break
            else:
                return False

            if "only_chunks" in test and attr("test_chunk") not in test["only_chunks"]:
                return False

            tier = task.task["extra"]["treeherder"]["tier"]
            if "platforms" in test:
                if "all" in test["platforms"]:
                    return True
                platform = attr("test_platform", "").split("/")[0]
                # Platforms can be forced by syntax like "-u xpcshell[Windows 8]"
                return platform in test["platforms"]
            if tier != 1:
                # Run Tier 2/3 tests if their build task is Tier 2/3 OR if there is
                # no tier 1 test of that name.
                build_task = self.full_task_graph.tasks[task.dependencies["build"]]
                build_task_tier = build_task.task["extra"]["treeherder"]["tier"]

                name = attr("unittest_try_name")
                test_tiers = self.test_tiers.get(name)

                if tier <= build_task_tier:
                    logger.debug(
                        f"not skipping tier {tier} test {task.label} because build task {build_task.label} "
                        f"is tier {build_task_tier}"
                    )
                    return True
                if 1 not in test_tiers:
                    logger.debug(
                        f"not skipping tier {tier} test {task.label} without explicit inclusion; "
                        f"it is configured to run on tiers {test_tiers}"
                    )
                    return True
                logger.debug(
                    f"skipping tier {tier} test {task.label} because build task {build_task.label} is "
                    f"tier {build_task_tier} and there is a higher-tier test of the same name"
                )
                return False
            if run_by_default:
                return check_run_on_projects()
            return False

        if attr("job_try_name"):
            # Beware the subtle distinction between [] and None for self.jobs and self.platforms.
            # They will be [] if there was no try syntax, and None if try syntax was detected but
            # they remained unspecified.
            if self.jobs is not None:
                return attr("job_try_name") in self.jobs

            # User specified `-j all`
            if self.platforms is not None and attr("build_platform") not in self.platforms:
                return False  # honor -p for jobs governed by a platform
            # "all" means "everything with `try` in run_on_projects"
            return check_run_on_projects()
        if attr("kind") == "test":
            return match_test(self.unittests, "unittest_try_name")
        if attr("kind") in BUILD_KINDS:
            if attr("build_type") not in self.build_types:
                return False
            if self.platforms is None:
                # for "-p all", look for try in the 'run_on_projects' attribute
                return check_run_on_projects()
            if attr("build_platform") not in self.platforms:
                return False
            return True
        return False

    def __str__(self):
        def none_for_all(list):
            if list is None:
                return "<all>"
            return ", ".join(str(e) for e in list)

        return "\n".join(
            [
                "build_types: " + ", ".join(self.build_types),
                "platforms: " + none_for_all(self.platforms),
                "unittests: " + none_for_all(self.unittests),
                "jobs: " + none_for_all(self.jobs),
                "trigger_tests: " + str(self.trigger_tests),
                "interactive: " + str(self.interactive),
                "notifications: " + str(self.notifications),
                "tag: " + str(self.tag),
                "no_retry: " + str(self.no_retry),
            ]
        )


def _try_cc_option_syntax(full_task_graph, parameters, graph_config):
    """Generate a list of target tasks based on try syntax in
    parameters['message'] and, for context, the full task graph.
    """
    options = TryOptionSyntax(parameters, full_task_graph, graph_config)
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
