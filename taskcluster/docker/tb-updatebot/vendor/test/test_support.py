# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, # You can obtain one at http://mozilla.org/MPL/2.0/.

import json
from pathlib import Path
from unittest.mock import MagicMock, mock_open, patch

import conftest  # noqa: F401
import pytest
import requests.exceptions
import responses
import vendor


def stringio_open(*args, **kwargs):
    # Much of this borrowed from unittest.mock.mock_open
    import _io

    open_spec = list(set(dir(_io.open)))
    file_spec = list(set(dir(_io.TextIOWrapper)).union(set(dir(_io.BytesIO))))
    mock = MagicMock(name="open", spec=open_spec)
    handle = MagicMock(name="handle", spec=file_spec)

    _state = ["", None]

    def _write_side_effect(data, *args, **kwargs):
        _state[0] = data

    handle.write.side_effect = _write_side_effect
    handle.write.return_value = None

    def _read_side_effect(*args, **kwargs):
        return _state[0]

    handle.read.side_effect = _read_side_effect
    handle.read.return_value = None

    handle.__enter__.return_value = handle
    mock.return_value = handle
    return mock


@patch("vendor.support.Path.home", return_value=Path("/home"))
@patch("vendor.support.os.chmod")
def test_write_ssh_key(mock_home, mock_chmod):
    with patch("builtins.open", mock_open()) as m:
        vendor.support.write_ssh_key("dummy_file", "dummy_value")

        mock_chmod.assert_called_once()
        m.assert_called_once_with(Path("/home") / "dummy_file", "w")
        handle = m()
        handle.write.assert_called_once_with("dummy_value")


@patch("vendor.support.Path.home", return_value=Path("/home"))
def test_hgrc_userinfo(mock_home):
    username = "username"
    keyfile = "/path/to/keyfile"
    with patch("builtins.open", stringio_open()) as m:
        vendor.support.write_hgrc_userinfo(username, Path(keyfile))

        m.assert_called_once_with(Path("/home") / ".hgrc", "w")
        handle = m()
        written_lines = handle.read().split("\n")
        assert len(written_lines) == 4
        assert keyfile in written_lines[1]
        assert f"{username}@mozilla.com" in written_lines[2]


@patch("vendor.support.Path.home", return_value=Path("/home"))
@patch("vendor.support.os.chmod")
def test_write_arcrc(mock_home, mock_chmod):
    phab_url = "https://bogus.example.zzz/"
    phab_token = "bogus_token"
    with patch("builtins.open", stringio_open()) as m:
        vendor.support.write_arcrc(phab_url, phab_token)

        mock_chmod.assert_called_once()
        m.assert_called_once_with(Path("/home") / ".arcrc", "w")
        handle = m()
        written = handle.read()
        data = json.loads(written)
        assert "hosts" in data
        assert phab_url in data["hosts"]
        assert data["hosts"][phab_url] == phab_token


@responses.activate
@pytest.mark.parametrize(
    "task_id,artifact_path,body,status,expected",
    [
        pytest.param("AAAAAAA", "public/foo.txt", "D12345", 200, "D12345"),
        pytest.param("BBBBBBB", "public/checksums.json", '{"a": "b"}', 200, '{"a": "b"}'),
        pytest.param("CCCC404", "public/notfound.json", "", 404, None),
        pytest.param("DDDD401", "public/unauthorized.txt", "", 401, None),
    ],
)
def test_fetch_indexed_artifact(task_id, artifact_path, body, status, expected):
    url = vendor.support.artifact_url(task_id, artifact_path)

    responses.get(
        url,
        body=body,
        status=status,
    )
    if status in (200, 404):
        artifact = vendor.support.fetch_indexed_artifact(task_id, artifact_path)
        assert artifact == expected
    else:
        with pytest.raises(requests.exceptions.HTTPError):
            artifact = vendor.support.fetch_indexed_artifact(task_id, artifact_path)
            responses.assert_call_count(url, 1)


class Repo:
    api_url = "https://api_url"
    dot_path = "dot_path"
    phab_url = "phab_url"
    path = "path"
    cvs = "git"


conduit = vendor.support.ExtendedConduit()
conduit.set_repo(Repo())


class TestExtendedConduit:
    @staticmethod
    def _get_revisions(is_closed):
        return [{"fields": {"status": {"closed": is_closed}}}]

    @patch("vendor.support.ExtendedConduit.get_revisions")
    def test_is_revision_open(self, mock_get_revisions):
        mock_get_revisions.return_value = self._get_revisions(True)
        assert not conduit.is_revision_open("D12345")

        mock_get_revisions.return_value = self._get_revisions(False)
        assert conduit.is_revision_open("D12345")
