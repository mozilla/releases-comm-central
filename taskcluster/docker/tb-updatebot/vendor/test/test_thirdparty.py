# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, # You can obtain one at http://mozilla.org/MPL/2.0/.

import subprocess
from unittest.mock import patch

import conftest  # noqa: F401
import pytest
from vendor.error import UpdateCheckException, VendorException
from vendor.thirdparty import Library, check_for_update, select_libraries, update_library
from vendor.versions import DEFAULT_TAG_PATTERN


def make_library(name, tracking="tag"):
    return Library(
        name=name,
        revision="v1.3.1",
        url=f"https://example.com/{name}",
        tracking=tracking,
        tag_pattern=DEFAULT_TAG_PATTERN,
    )


BOTAN = make_library("botan")
JSON_C = make_library("json-c")
ZLIB = make_library("zlib")


class FakeConduit:
    """Conduit stand-in that tracks which revisions were abandoned."""

    def __init__(self, open_revisions=()):
        self.open_revisions = set(open_revisions)
        self.abandoned = []

    def is_revision_open(self, phab_rev_id):
        return phab_rev_id in self.open_revisions

    def abandon_revision(self, phab_rev_id):
        self.abandoned.append(phab_rev_id)
        self.open_revisions.discard(phab_rev_id)


def test_no_previous_state():
    conduit = FakeConduit()
    with patch("vendor.thirdparty.check_for_update", return_value="v1.3.2"):
        assert next(select_libraries([ZLIB], {}, conduit, [])) == (ZLIB, "v1.3.2")


def test_open_revision_for_same_revision_is_skipped():
    conduit = FakeConduit(["D1"])
    state = {"zlib": {"revision": "v1.3.2", "phab_rev": "D1"}}
    with patch("vendor.thirdparty.check_for_update", return_value="v1.3.2"):
        assert list(select_libraries([ZLIB], state, conduit, [])) == []
    assert conduit.abandoned == []


def test_open_revision_for_older_revision_is_abandoned():
    conduit = FakeConduit(["D1"])
    state = {"zlib": {"revision": "v1.3.1", "phab_rev": "D1"}}
    with patch("vendor.thirdparty.check_for_update", return_value="v1.3.2"):
        assert next(select_libraries([ZLIB], state, conduit, [])) == (ZLIB, "v1.3.2")
    assert conduit.abandoned == ["D1"]


def test_closed_revision_for_same_revision_is_not_resubmitted():
    conduit = FakeConduit()
    state = {"zlib": {"revision": "v1.3.2", "phab_rev": "D1"}}
    with patch("vendor.thirdparty.check_for_update", return_value="v1.3.2"):
        assert list(select_libraries([ZLIB], state, conduit, [])) == []
    assert conduit.abandoned == []


def test_closed_revision_for_older_revision_is_resubmitted():
    conduit = FakeConduit()
    state = {"zlib": {"revision": "v1.3.1", "phab_rev": "D1"}}
    with patch("vendor.thirdparty.check_for_update", return_value="v1.3.2"):
        assert next(select_libraries([ZLIB], state, conduit, [])) == (ZLIB, "v1.3.2")
    assert conduit.abandoned == []


def test_failed_submission_is_retried():
    """A run that could not reach Phabricator leaves phab_rev unset."""
    conduit = FakeConduit()
    state = {"zlib": {"revision": "v1.3.2", "phab_rev": None}}
    with patch("vendor.thirdparty.check_for_update", return_value="v1.3.2"):
        assert next(select_libraries([ZLIB], state, conduit, [])) == (ZLIB, "v1.3.2")


def test_first_library_needing_work_wins():
    conduit = FakeConduit(["D1"])
    state = {"json-c": {"revision": "0.19", "phab_rev": "D1"}}
    with patch("vendor.thirdparty.check_for_update", side_effect=[None, "0.19", "v1.3.2"]):
        assert next(select_libraries([BOTAN, JSON_C, ZLIB], state, conduit, [])) == (
            ZLIB,
            "v1.3.2",
        )
    assert conduit.abandoned == []


def test_failed_update_check_is_skipped():
    conduit = FakeConduit()
    failed = []
    with patch(
        "vendor.thirdparty.check_for_update",
        side_effect=[UpdateCheckException("botan broke"), "v1.3.2"],
    ):
        assert next(select_libraries([BOTAN, ZLIB], {}, conduit, failed)) == (
            ZLIB,
            "v1.3.2",
        )
    assert failed == ["botan"]


def completed(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess([], returncode, stdout=stdout, stderr=stderr)


ICALJS = make_library("icaljs", tracking="commit")


@patch("vendor.thirdparty.subprocess.run")
def test_check_for_update_returns_revision(mock_run):
    mock_run.return_value = completed(stdout="abc123 2026-01-01\n")
    assert check_for_update(ICALJS) == "abc123"


@patch("vendor.thirdparty.subprocess.run")
def test_check_for_update_up_to_date(mock_run):
    mock_run.return_value = completed(stdout="\n")
    assert check_for_update(ICALJS) is None


@patch("vendor.thirdparty.subprocess.run")
def test_check_for_update_failure_raises(mock_run):
    mock_run.side_effect = subprocess.CalledProcessError(
        1, [], output="", stderr="no such manifest"
    )
    with pytest.raises(UpdateCheckException, match="no such manifest"):
        check_for_update(ICALJS)


@patch("vendor.thirdparty.subprocess.run")
def test_check_for_update_unexpected_output_raises(mock_run):
    mock_run.return_value = completed(stdout="one two three\n")
    with pytest.raises(UpdateCheckException):
        check_for_update(ICALJS)


@patch("vendor.thirdparty.notify")
@patch("vendor.thirdparty.push_to_try", return_value=None)
@patch("vendor.thirdparty.submit_phabricator", return_value="D2")
@patch("vendor.thirdparty.commit_changes")
@patch("vendor.thirdparty.run_vendor")
@patch("vendor.thirdparty.get_conduit")
def test_library_that_vendors_nothing_is_skipped(
    mock_get_conduit, mock_run_vendor, mock_commit, mock_submit, mock_push, mock_notify
):
    mock_get_conduit.return_value = FakeConduit()
    mock_run_vendor.side_effect = [VendorException("nothing for botan"), None]
    state = {}

    with patch("vendor.thirdparty.check_for_update", side_effect=["3.0", "v1.3.2"]):
        update_library([BOTAN, ZLIB], state)

    assert [call.args[0] for call in mock_run_vendor.call_args_list] == [BOTAN, ZLIB]
    assert mock_commit.call_args.args == (ZLIB, "v1.3.2")
    assert state == {"zlib": {"revision": "v1.3.2", "phab_rev": "D2"}}
    mock_notify.assert_called_once()


@patch("vendor.thirdparty.notify")
@patch("vendor.thirdparty.push_to_try", return_value=None)
@patch("vendor.thirdparty.submit_phabricator", return_value="D2")
@patch("vendor.thirdparty.commit_changes")
@patch("vendor.thirdparty.run_vendor")
@patch("vendor.thirdparty.get_conduit")
def test_failed_update_check_is_included_in_the_notification(
    mock_get_conduit, mock_run_vendor, mock_commit, mock_submit, mock_push, mock_notify
):
    mock_get_conduit.return_value = FakeConduit()

    with patch(
        "vendor.thirdparty.check_for_update",
        side_effect=[UpdateCheckException("botan broke"), "v1.3.2"],
    ):
        update_library([BOTAN, ZLIB], {})

    assert "botan" in mock_notify.call_args.args[0]


@patch("vendor.thirdparty.run_vendor")
@patch("vendor.thirdparty.get_conduit")
def test_failed_update_check_with_nothing_to_submit_raises(mock_get_conduit, mock_run_vendor):
    mock_get_conduit.return_value = FakeConduit()

    with patch(
        "vendor.thirdparty.check_for_update",
        side_effect=[UpdateCheckException("botan broke"), None],
    ):
        with pytest.raises(UpdateCheckException, match="botan"):
            update_library([BOTAN, ZLIB], {})

    mock_run_vendor.assert_not_called()
