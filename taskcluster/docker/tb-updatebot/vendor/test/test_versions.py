# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import conftest  # noqa: F401
import pytest
from vendor.versions import (
    CUSTOM_TAG_PATTERNS,
    Version,
    parse_ls_remote,
    parse_tag,
    select_update,
)

TAGS = ["v1.2.13", "v1.3", "v1.3.1", "v1.3.2", "v1.4.0", "v1.4.1", "v2.0.0", "v2.1.0", "v3.0.0"]


def test_parse_tag():
    assert parse_tag("v1.3.1") == Version(1, 3, 1)
    assert parse_tag("1.3") == Version(1, 3, 0)
    assert parse_tag("v1.3.1-rc1") is None
    assert parse_tag("latest") is None


def test_parse_ls_remote():
    output = "abc123\trefs/tags/v1.3.1\ndef456\trefs/tags/v1.3.2\n"
    assert parse_ls_remote(output) == ["v1.3.1", "v1.3.2"]


def test_stable_takes_latest_patch_only():
    assert select_update("v1.3.1", TAGS, stable=True) == "v1.3.2"


def test_stable_up_to_date():
    assert select_update("v1.3.2", TAGS, stable=True) is None


def test_main_takes_latest_minor_over_patch():
    assert select_update("v1.3.1", TAGS, stable=False) == "v1.4.1"


def test_main_moves_to_next_major_only_when_current_major_is_exhausted():
    assert select_update("v1.4.1", TAGS, stable=False) == "v2.1.0"


def test_main_up_to_date():
    assert select_update("v3.0.0", TAGS, stable=False) is None


def test_older_tag_created_later_is_not_a_downgrade():
    assert select_update("v1.3.1", ["v1.3.1", "v1.2.14"], stable=False) is None


def test_prereleases_are_ignored():
    assert select_update("v1.3.1", ["v1.3.2-rc1", "v1.4.0-beta"], stable=False) is None


JSON_C_TAGS = ["json-c-0.16-20220414", "json-c-0.18-20240915", "json-c-0.19-20260627"]


def test_json_c_main_takes_latest_minor():
    pattern = CUSTOM_TAG_PATTERNS["json-c"]
    assert select_update("json-c-0.16-20220414", JSON_C_TAGS, False, pattern) == (
        "json-c-0.19-20260627"
    )


def test_json_c_stable_has_no_patch_releases():
    pattern = CUSTOM_TAG_PATTERNS["json-c"]
    assert select_update("json-c-0.16-20220414", JSON_C_TAGS, True, pattern) is None


def test_unparseable_current_revision():
    with pytest.raises(ValueError):
        select_update("abcdef1234", TAGS, stable=False)
