#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

import json
import os
import unittest

import conftest  # noqa: F401
from mozunit import main

from gecko_taskgraph.util import hg

from comm_taskgraph import files_changed

PARAMS = {
    "comm_head_repository": "https://hg.mozilla.org/comm-central",
    "comm_head_rev": "d0c328a2cc33",
    "head_repository": "https://hg.mozilla.org/mozilla-central",
    "head_rev": "6ca54f5a4a1b",
    "comm_src_path": "comm/",
}

FILES_CHANGED_CC = [
    "mail/base/content/mailWindowOverlay.js",
    "mail/components/extensions/parent/ext-compose.js",
    "mail/components/extensions/parent/ext-mail.js",
    "mail/components/extensions/parent/ext-messages.js",
    "mail/test/browser/folder-widget/browser.ini",
    "mail/test/browser/folder-widget/browser_messageFilters.js",
    "mailnews/base/src/nsMsgGroupView.cpp",
    "mailnews/base/src/nsMsgQuickSearchDBView.cpp",
    "mailnews/base/src/nsMsgSearchDBView.cpp",
    "mailnews/base/src/nsMsgThreadedDBView.cpp",
    "mailnews/base/src/nsMsgXFVirtualFolderDBView.cpp",
]

FILES_CHANGED_MC = [
    "modules/libpref/init/StaticPrefList.yaml",
    "modules/libpref/init/all.js",
    "testing/profiles/web-platform/user.js",
    "testing/web-platform/meta/webtransport/__dir__.ini",
    "toolkit/components/cleardata/ClearDataService.sys.mjs",
    "toolkit/components/cleardata/tests/unit/test_identity_credential_storage.js",
    "toolkit/components/formautofill/FormAutofillStorageBase.sys.mjs",
    "toolkit/components/normandy/content/AboutPages.sys.mjs",
    "toolkit/components/passwordmgr/FirefoxRelay.sys.mjs",
    "toolkit/components/url-classifier/UrlClassifierListManager.sys.mjs",
    "toolkit/modules/NewTabUtils.sys.mjs",
]

FILES_CHANGED = sorted(
    FILES_CHANGED_MC + [os.path.join("comm", file) for file in FILES_CHANGED_CC]
)


class FakeResponse:
    def __init__(self, url, **kwargs):
        if "comm-central" in url:
            self.filename = "cc_automationrelevance.json"
        elif "mozilla-central" in url:
            self.filename = "mc_automationrelevance.json"
        else:
            raise Exception(f"Invalid automation URL: {url}")

    def json(self):
        with open(os.path.join(os.path.dirname(__file__), self.filename)) as f:
            return json.load(f)


class TestGetChangedFiles(unittest.TestCase):
    def setUp(self):
        files_changed.get_changed_files.clear()
        self.old_get = hg.requests.get

        def fake_get(url, **kwargs):
            return FakeResponse(url)

        hg.requests.get = fake_get

    def tearDown(self):
        hg.requests.get = self.old_get
        files_changed.get_changed_files.clear()

    def test_get_changed_files_mc(self):
        """Get_changed_files correctly gets the list of changed files in a push.
        This tests against the production hg.mozilla.org so that it will detect
        any changes in the format of the returned data."""
        self.assertEqual(
            sorted(files_changed.get_changed_files(PARAMS["head_repository"], PARAMS["head_rev"])),
            FILES_CHANGED_MC,
        )

    def test_get_changed_files_cc(self):
        """Get_changed_files correctly gets the list of changed files in a push.
        This tests against the production hg.mozilla.org so that it will detect
        any changes in the format of the returned data."""
        self.assertEqual(
            sorted(
                files_changed.get_changed_files(
                    PARAMS["comm_head_repository"], PARAMS["comm_head_rev"]
                )
            ),
            FILES_CHANGED_CC,
        )

    def test_get_changed_files_extended(self):
        """Get_changed_files_extended correctly gets the list of changed files in a push.
        This tests against the production hg.mozilla.org so that it will detect
        any changes in the format of the returned data."""
        self.assertEqual(
            sorted(files_changed.get_files_changed_extended(PARAMS)),
            FILES_CHANGED,
        )


class TestCheck(unittest.TestCase):
    def setUp(self):
        files_changed.get_changed_files[PARAMS["head_repository"], PARAMS["head_rev"]] = set(
            FILES_CHANGED_MC
        )
        files_changed.get_changed_files[
            PARAMS["comm_head_repository"], PARAMS["comm_head_rev"]
        ] = set(FILES_CHANGED_CC)

    def tearDown(self):
        files_changed.get_changed_files.clear()

    def test_check_no_params(self):
        self.assertTrue(files_changed.check({}, ["ignored"]))

    def test_check_no_match(self):
        self.assertFalse(files_changed.check(PARAMS, ["nosuch/**"]))
        self.assertFalse(files_changed.check(PARAMS, ["comm/nosuch/**"]))

    def test_check_match_mc(self):
        self.assertTrue(files_changed.check(PARAMS, ["toolkit/**"]))

    def test_check_match_cc(self):
        self.assertTrue(files_changed.check(PARAMS, ["comm/mail/**"]))


if __name__ == "__main__":
    main()
