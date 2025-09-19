# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


import unittest

import conftest  # noqa: F401
from mozunit import main
from taskgraph.graph import Graph
from taskgraph.task import Task
from taskgraph.taskgraph import TaskGraph

from comm_taskgraph.try_option_syntax import TryOptionSyntax, parse_message


def unittest_task(n, tp, bt="opt"):
    return (
        n,
        Task(
            "test",
            n,
            {
                "unittest_try_name": n,
                "test_platform": tp.split("/")[0],
                "build_type": bt,
            },
            {},
        ),
    )


tasks = {
    k: v
    for k, v in [
        unittest_task("mochitest-browser-chrome-e10s", "linux64/opt"),
        unittest_task("extra1", "linux", "debug/opt"),
        unittest_task("extra2", "win32/opt"),
        unittest_task("gtest", "linux64/asan"),
        unittest_task("extra4", "linux64/debug", "debug"),
        unittest_task("extra5", "linux/this"),
        unittest_task("extra6", "linux/that"),
        unittest_task("extra7", "linux/other"),
        unittest_task("extra8", "linux64/asan"),
    ]
}

GRAPH_CONFIG = {
    "try": {},
}

unittest_tasks = {k: v for k, v in tasks.items() if "unittest_try_name" in v.attributes}
graph_with_jobs = TaskGraph(tasks, Graph(set(tasks), set()))


class TestTryOptionSyntax(unittest.TestCase):
    def test_unknown_args(self):
        "unknown arguments are ignored"
        parameters = parse_message("try: --doubledash -z extra")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        # equilvant to "try:"..
        self.assertEqual(tos.build_types, [])
        self.assertEqual(tos.jobs, [])

    def test_apostrophe_in_message(self):
        "apostrophe does not break parsing"
        parameters = parse_message("Increase spammy log's log level. try: -b do")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(sorted(tos.build_types), ["debug", "opt"])

    def test_b_do(self):
        "-b do should produce both build_types"
        parameters = parse_message("try: -b do")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(sorted(tos.build_types), ["debug", "opt"])

    def test_b_d(self):
        "-b d should produce build_types=['debug']"
        parameters = parse_message("try: -b d")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(sorted(tos.build_types), ["debug"])

    def test_b_o(self):
        "-b o should produce build_types=['opt']"
        parameters = parse_message("try: -b o")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(sorted(tos.build_types), ["opt"])

    def test_build_o(self):
        "--build o should produce build_types=['opt']"
        parameters = parse_message("try: --build o")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(sorted(tos.build_types), ["opt"])

    def test_b_dx(self):
        "-b dx should produce build_types=['debug'], silently ignoring the x"
        parameters = parse_message("try: -b dx")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(sorted(tos.build_types), ["debug"])

    def test_j_job(self):
        "-j somejob sets jobs=['somejob']"
        parameters = parse_message("try: -j somejob")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(sorted(tos.jobs), ["somejob"])

    def test_j_jobs(self):
        "-j job1,job2 sets jobs=['job1', 'job2']"
        parameters = parse_message("try: -j job1,job2")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(sorted(tos.jobs), ["job1", "job2"])

    def test_j_all(self):
        "-j all sets jobs=None"
        parameters = parse_message("try: -j all")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(tos.jobs, None)

    def test_j_twice(self):
        "-j job1 -j job2 sets jobs=job1, job2"
        parameters = parse_message("try: -j job1 -j job2")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(sorted(tos.jobs), sorted(["job1", "job2"]))

    def test_p_all(self):
        "-p all sets platforms=None"
        parameters = parse_message("try: -p all")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(tos.platforms, None)

    def test_p_linux(self):
        "-p linux sets platforms=['linux']"
        parameters = parse_message("try: -p linux")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(tos.platforms, ["linux"])

    def test_p_linux_win32(self):
        "-p linux,win32 sets platforms=['linux', 'win32']"
        parameters = parse_message("try: -p linux,win32")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(sorted(tos.platforms), ["linux", "win32"])

    def test_u_none(self):
        "-u none sets unittests=[]"
        parameters = parse_message("try: -u none")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(tos.unittests, [])

    def test_u_all(self):
        "-u all sets unittests=[..whole list..]"
        parameters = parse_message("try: -u all")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(tos.unittests, [{"test": t} for t in sorted(unittest_tasks)])

    def test_u_single(self):
        "-u mochitest-webgl1-core sets unittests=[mochitest-webgl1-core]"
        parameters = parse_message("try: -u mochitest-webgl1-core")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(tos.unittests, [{"test": "mochitest-webgl1-core"}])

    def test_u_commas(self):
        "-u mochitest-webgl1-core,gtest sets unittests=both"
        parameters = parse_message("try: -u mochitest-webgl1-core,gtest")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(
            tos.unittests,
            [
                {"test": "gtest"},
                {"test": "mochitest-webgl1-core"},
            ],
        )

    def test_u_chunks(self):
        "-u gtest-3,gtest-4 selects the third and fourth chunk of gtest"
        parameters = parse_message("try: -u gtest-3,gtest-4")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(
            sorted(tos.unittests),
            sorted(
                [
                    {"test": "gtest", "only_chunks": set("34")},
                ]
            ),
        )

    def test_u_platform(self):
        "-u gtest[linux] selects the linux platform for gtest"
        parameters = parse_message("try: -u gtest[linux]")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(
            sorted(tos.unittests),
            sorted(
                [
                    {"test": "gtest", "platforms": ["linux"]},
                ]
            ),
        )

    def test_u_platforms(self):
        "-u gtest[linux,win32] selects the linux and win32 platforms for gtest"
        parameters = parse_message("try: -u gtest[linux,win32]")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(
            sorted(tos.unittests),
            sorted(
                [
                    {"test": "gtest", "platforms": ["linux", "win32"]},
                ]
            ),
        )

    def test_u_platforms_pretty(self):
        """-u gtest[Ubuntu] selects the linux, linux64 and linux64-asan
        platforms for gtest"""
        parameters = parse_message("try: -u gtest[Ubuntu]")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(
            sorted(tos.unittests),
            sorted(
                [
                    {
                        "test": "gtest",
                        "platforms": [
                            "linux64",
                            "linux64-asan",
                            "linux1804-64",
                            "linux1804-64-asan",
                        ],
                    },
                ]
            ),
        )

    def test_u_platforms_negated(self):
        "-u gtest[-linux] selects all platforms but linux for gtest"
        parameters = parse_message("try: -u gtest[-linux]")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        all_platforms = {x.attributes["test_platform"] for x in unittest_tasks.values()}
        self.assertEqual(
            sorted(tos.unittests[0]["platforms"]),
            sorted(x for x in all_platforms if x != "linux"),
        )

    def test_u_chunks_platforms(self):
        "-u gtest-1[win32] selects the win32 platform for chunk 1 of gtest"
        parameters = parse_message("try: -u gtest-1[win32]")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(
            tos.unittests,
            [
                {
                    "test": "gtest",
                    "platforms": ["win32"],
                    "only_chunks": set("1"),
                },
            ],
        )

    def test_trigger_tests(self):
        "--rebuild 10 sets trigger_tests"
        parameters = parse_message("try: --rebuild 10")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(tos.trigger_tests, 10)

    def test_interactive(self):
        "--interactive sets interactive"
        parameters = parse_message("try: --interactive")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(tos.interactive, True)

    def test_all_email(self):
        "--all-emails sets notifications"
        parameters = parse_message("try: --all-emails")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(tos.notifications, "all")

    def test_fail_email(self):
        "--failure-emails sets notifications"
        parameters = parse_message("try: --failure-emails")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(tos.notifications, "failure")

    def test_no_email(self):
        "no email settings don't set notifications"
        parameters = parse_message("try:")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(tos.notifications, None)

    def test_setenv(self):
        "--setenv VAR=value adds a environment variables setting to env"
        parameters = parse_message("try: --setenv VAR1=value1 --setenv VAR2=value2")
        assert parameters["try_task_config"]["env"] == {
            "VAR1": "value1",
            "VAR2": "value2",
        }

    def test_profile(self):
        "--gecko-profile sets profile to true"
        parameters = parse_message("try: --gecko-profile")
        assert parameters["try_task_config"]["gecko-profile"] is True

    def test_tag(self):
        "--tag TAG sets tag to TAG value"
        parameters = parse_message("try: --tag tagName")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertEqual(tos.tag, "tagName")

    def test_no_retry(self):
        "--no-retry sets no_retry to true"
        parameters = parse_message("try: --no-retry")
        tos = TryOptionSyntax(parameters, graph_with_jobs, GRAPH_CONFIG)
        self.assertTrue(tos.no_retry)

    def test_artifact(self):
        "--artifact sets artifact to true"
        parameters = parse_message("try: --artifact")
        assert parameters["try_task_config"]["use-artifact-builds"] is True


if __name__ == "__main__":
    main()
