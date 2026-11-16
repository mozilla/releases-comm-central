#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

import unittest
from unittest import mock

import conftest  # noqa: F401
from mozunit import main
from taskcluster.exceptions import TaskclusterRestFailure
from taskgraph.graph import Graph
from taskgraph.task import Task
from taskgraph.taskgraph import TaskGraph

from comm_taskgraph.util import shippable_repacks
from comm_taskgraph.util.shippable_repacks import (
    filter_out_shippable_repacks,
    get_shippable_repacks_produced_index,
    should_schedule_shippable_repacks,
)

GRAPH_CONFIG = {"trust-domain": "enterprise"}
# Under the enterprise-firefox repository the push came from, which is where its
# decision tasks may insert index entries, not under the enterprise-thunderbird
# project.
INDEX_PATH = (
    "enterprise.v2.enterprise-firefox.branch.enterprise-main.thunderbird."
    "shippable-repacks-produced.2026.11.04"
)
# 2026-11-04T12:00:00Z
BUILD_DATE = 1793793600


def make_parameters(**overrides):
    parameters = {
        "project": "enterprise-thunderbird",
        "base_repository": "https://github.com/mozilla/enterprise-firefox",
        "head_ref": "refs/heads/enterprise-main",
        "repository_type": "git",
        "tasks_for": "github-push",
        "level": "3",
        "build_date": BUILD_DATE,
    }
    parameters.update(overrides)
    return parameters


class TestShippableRepacksIndex(unittest.TestCase):
    def test_index_path(self):
        self.assertEqual(
            get_shippable_repacks_produced_index(make_parameters(), GRAPH_CONFIG),
            INDEX_PATH,
        )

    def test_index_path_by_branch(self):
        parameters = make_parameters(head_ref="refs/heads/enterprise-release")
        self.assertEqual(
            get_shippable_repacks_produced_index(parameters, GRAPH_CONFIG),
            INDEX_PATH.replace("enterprise-main", "enterprise-release"),
        )

    def test_index_path_pull_request(self):
        parameters = make_parameters(tasks_for="github-pull-request")
        self.assertEqual(
            get_shippable_repacks_produced_index(parameters, GRAPH_CONFIG),
            "enterprise.v2.enterprise-firefox-pr.thunderbird."
            "shippable-repacks-produced.2026.11.04",
        )

    def test_index_path_utc_day(self):
        parameters = make_parameters(build_date=BUILD_DATE + 12 * 3600)
        self.assertTrue(
            get_shippable_repacks_produced_index(parameters, GRAPH_CONFIG).endswith(".2026.11.05")
        )


@mock.patch.dict("os.environ", {"TASK_ID": "own-decision"})
@mock.patch.object(shippable_repacks, "get_taskcluster_client")
@mock.patch.object(shippable_repacks, "state_task")
@mock.patch.object(shippable_repacks, "find_task_id")
class TestShouldScheduleShippableRepacks(unittest.TestCase):
    def test_first_push_of_the_day(self, find_task_id, state_task, client):
        find_task_id.side_effect = TaskclusterRestFailure("not found", None)
        self.assertTrue(should_schedule_shippable_repacks(make_parameters(), GRAPH_CONFIG))
        client.return_value.insertTask.assert_called_once_with(
            INDEX_PATH,
            {
                "taskId": "own-decision",
                "rank": BUILD_DATE,
                "data": {},
                "expires": "2026-11-18T12:00:00.000Z",
            },
        )

    def test_already_scheduled(self, find_task_id, state_task, client):
        find_task_id.return_value = "other-decision"
        for state in ("pending", "running", "completed"):
            state_task.return_value = state
            self.assertFalse(should_schedule_shippable_repacks(make_parameters(), GRAPH_CONFIG))
        client.return_value.insertTask.assert_not_called()

    def test_previous_decision_failed(self, find_task_id, state_task, client):
        find_task_id.return_value = "other-decision"
        for state in ("failed", "exception"):
            state_task.return_value = state
            self.assertTrue(should_schedule_shippable_repacks(make_parameters(), GRAPH_CONFIG))
        self.assertEqual(client.return_value.insertTask.call_count, 2)

    def test_decision_rerun(self, find_task_id, state_task, client):
        find_task_id.return_value = "own-decision"
        self.assertTrue(should_schedule_shippable_repacks(make_parameters(), GRAPH_CONFIG))
        state_task.assert_not_called()

    def test_not_gated(self, find_task_id, state_task, client):
        for overrides in (
            {"level": "1"},
            {"tasks_for": "github-pull-request"},
            {"project": "comm-central"},
        ):
            self.assertTrue(
                should_schedule_shippable_repacks(make_parameters(**overrides), GRAPH_CONFIG)
            )
        find_task_id.assert_not_called()
        client.return_value.insertTask.assert_not_called()


class TestFilterOutShippableRepacks(unittest.TestCase):
    def setUp(self):
        def task(label, kind, **attributes):
            return Task(kind=kind, label=label, attributes=attributes, task={})

        tasks = {
            t.label: t
            for t in (
                task("toolchain", "toolchain"),
                task("build-opt", "build", build_platform="linux64-enterprise"),
                task(
                    "build-shippable",
                    "build",
                    build_platform="linux64-enterprise-shippable",
                    shippable=True,
                ),
                task(
                    "repack",
                    "enterprise-repack",
                    build_platform="linux64-enterprise-shippable",
                ),
                task("oci-upload", "enterprise-oci-upload"),
                task("oci-tag", "enterprise-oci-tag"),
            )
        }
        edges = {
            ("build-opt", "toolchain", "toolchain"),
            ("build-shippable", "toolchain", "toolchain"),
            ("repack", "build-shippable", "build"),
            ("oci-upload", "repack", "repack"),
            ("oci-tag", "oci-upload", "upload"),
        }
        self.graph = TaskGraph(tasks, Graph(set(tasks), edges))
        self.labels = sorted(tasks)

    def test_scheduled(self):
        parameters = {"enterprise_schedule_shippable_repacks": True}
        self.assertEqual(
            filter_out_shippable_repacks(self.graph, parameters, self.labels), self.labels
        )

    def test_not_scheduled(self):
        parameters = {"enterprise_schedule_shippable_repacks": False}
        self.assertEqual(
            filter_out_shippable_repacks(self.graph, parameters, self.labels),
            ["build-opt", "toolchain"],
        )


if __name__ == "__main__":
    main()
