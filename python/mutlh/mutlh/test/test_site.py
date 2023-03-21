# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
from contextlib import nullcontext as does_not_raise

import conftest  # noqa: F401
import mozunit
import pytest

from buildconfig import topsrcdir
from mutlh.site import SiteNotFoundException, find_manifest


@pytest.mark.parametrize(
    "site_name,expected",
    [
        ("tb_common", does_not_raise("comm/python/sites/tb_common.txt")),
        ("lint", does_not_raise("python/sites/lint.txt")),
        ("not_a_real_site_name", pytest.raises(SiteNotFoundException)),
    ],
)
def test_find_manifest(site_name, expected):
    def get_path(result):
        return os.path.relpath(result, topsrcdir)

    with expected:
        assert get_path(find_manifest(topsrcdir, site_name)) == expected.enter_result


if __name__ == "__main__":
    mozunit.main()
