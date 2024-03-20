#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

import unittest

import conftest  # noqa: F401
from mozunit import main
from taskgraph.parameters import Parameters

from comm_taskgraph.parameters import register_parameters


class TestCommParameters(unittest.TestCase):
    vals = {
        "app_version": "app_version",
        "backstop": False,
        "base_repository": "base_repository",
        "base_ref": "base_ref",
        "base_rev": "base_rev",
        "build_date": 0,
        "build_number": 0,
        "comm_base_repository": "comm_base_repository",
        "comm_base_ref": "comm_base_ref",
        "comm_base_rev": "comm_base_rev",
        "comm_head_ref": "comm_head_ref",
        "comm_head_repository": "comm_head_repository",
        "comm_head_rev": "comm_head_rev",
        "comm_src_path": "comm/",
        "do_not_optimize": [],
        "enable_always_target": False,
        "existing_tasks": {},
        "files_changed": [],
        "filters": [],
        "head_ref": "head_ref",
        "head_repository": "head_repository",
        "head_rev": "head_rev",
        "head_tag": "",
        "hg_branch": "hg_branch",
        "level": "level",
        "message": "message",
        "moz_build_date": "moz_build_date",
        "next_version": "next_version",
        "optimize_strategies": None,
        "optimize_target_tasks": False,
        "owner": "owner",
        "phabricator_diff": "phabricator_diff",
        "project": "project",
        "pushdate": 0,
        "pushlog_id": "pushlog_id",
        "release_enable_emefree": False,
        "release_enable_partner_repack": False,
        "release_enable_partner_attribution": False,
        "release_eta": None,
        "release_history": {},
        "release_partners": [],
        "release_partner_config": None,
        "release_partner_build_number": 1,
        "release_type": "release_type",
        "release_product": None,
        "repository_type": "hg",
        "required_signoffs": [],
        "signoff_urls": {},
        "target_tasks_method": "target_tasks_method",
        "test_manifest_loader": "default",
        "tasks_for": "tasks_for",
        "try_mode": "try_mode",
        "try_options": None,
        "try_task_config": {},
        "version": "version",
    }

    def setUp(self):
        register_parameters()

    def test_Parameters_check(self):
        """
        Specifying all of the gecko and comm parameters doesn't result in an error.
        """
        p = Parameters(**self.vals)
        p.check()  # should not raise

    def test_Parameters_check_missing(self):
        """
        If any of the comm parameters are specified, all of them must be specified.
        """
        vals = self.vals.copy()
        del vals["comm_base_repository"]
        p = Parameters(**vals)
        self.assertRaises(Exception, p.check)

    def test_Parameters_check_extra(self):
        """
        If parameters other than the global and comm parameters are specified,
        an error is reported.
        """
        p = Parameters(extra="data", **self.vals)
        self.assertRaises(Exception, p.check)


if __name__ == "__main__":
    main()
