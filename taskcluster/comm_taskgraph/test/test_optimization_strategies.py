# Any copyright is dedicated to the public domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from __future__ import absolute_import

import hashlib
from datetime import datetime
from time import mktime

import responses
import pytest
from mozunit import main

# from responses import RequestsMock

from comm_taskgraph.optimize import SkipSuiteOnly
from taskgraph.optimize import registry
from taskgraph.task import Task


def generate_task():
    task = {}
    task.setdefault("label", "task-label")
    task.setdefault("kind", "build")
    task.setdefault("task", {})
    task.setdefault("attributes", {})

    for attr in (
        "dependencies",
        "optimization",
        "soft_dependencies",
        "release_artifacts",
    ):
        task.setdefault(attr, None)

    task["task"].setdefault("label", task["label"])
    return Task.from_json(task)


def idfn(param):
    if isinstance(param, tuple):
        return param[0].__name__
    return None


def generate_json_push_data(files_changed):
    return {
        "changesets": [
            {"desc": "commit comment", "files": files_changed, "node": "cdefgh"}
        ]
    }


@pytest.fixture
def params():
    return {
        "branch": "comm-central",
        "head_repository": "https://hg.mozilla.org/mozilla-central",
        "head_rev": "zyxwvu",
        "comm_head_repository": "https://hg.mozilla.org/comm-central",
        "comm_head_rev": "abcdef",
        "project": "comm-central",
        "pushlog_id": 1,
        "pushdate": mktime(datetime.now().timetuple()),
    }


def mk_rev(strings):
    data = "".join(strings).encode("utf-8")
    h = hashlib.new("sha1")
    h.update(data)
    return h.hexdigest()


@responses.activate
@pytest.mark.parametrize(
    "pushed_files,expected",
    [
        # suite-only push
        pytest.param(["suite/a/b/c.txt", "suite/b/c/d.txt"], True),
        # non-suite push
        pytest.param(["mail/a/b/c.txt", "mailnews/b/c/d.txt"], False),
        # mixed push
        pytest.param(["suite/a/b/c.txt", "calendar/b/c/d.txt"], False),
    ],
    ids=idfn,
)
def test_suite_only_strategy(params, pushed_files, expected):
    rev = mk_rev(pushed_files)
    params["comm_head_rev"] = rev

    responses.add(
        responses.GET,
        "https://hg.mozilla.org/comm-central/json-automationrelevance/{}".format(rev),
        json=generate_json_push_data(pushed_files),
        status=200,
    )
    task = generate_task()

    opt = SkipSuiteOnly()
    remove = opt.should_remove_task(task, params, None)

    assert remove == expected


@responses.activate
@pytest.mark.parametrize(
    "file_patterns,pushed_files,expected",
    [
        # suite-only push, matches files-changed
        pytest.param(["comm/**/*.txt"], ["suite/a/b/c.txt", "suite/b/c/d.js"], True),
        # suite-only push, does not match files-changed
        pytest.param(["comm/**/*.cpp"], ["suite/a/b/c.txt", "suite/b/c/d.js"], True),
        # non-suite push, matches files changed
        pytest.param(["comm/**/*.txt"], ["mail/a/b/c.txt", "mailnews/b/c/d.js"], False),
        # non-suite push, does not match files changed
        pytest.param(["comm/**/*.cpp"], ["mail/a/b/c.txt", "mailnews/b/c/d.js"], True),
    ],
    ids=idfn,
)
def test_suite_files_changed_strategy(params, file_patterns, pushed_files, expected):
    rev = mk_rev(pushed_files)
    params["comm_head_rev"] = rev

    # Fake the m-c json data
    responses.add(
        responses.GET,
        "https://hg.mozilla.org/mozilla-central/json-automationrelevance/zyxwvu",
        json=generate_json_push_data([]),
        status=200,
    )

    responses.add(
        responses.GET,
        "https://hg.mozilla.org/comm-central/json-automationrelevance/{}".format(rev),
        json=generate_json_push_data(pushed_files),
        status=200,
    )
    task = generate_task()

    opt = registry["skip-unless-changed-no-suite"]
    remove = opt.should_remove_task(task, params, file_patterns)

    assert remove == expected


if __name__ == "__main__":
    main()
