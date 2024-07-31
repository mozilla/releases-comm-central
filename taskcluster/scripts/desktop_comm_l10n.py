#!/usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

import json
import os
import sys

GECKO_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
MOZHARNESS = os.path.join(GECKO_PATH, "testing/mozharness")
COMM_PYTHON_L10N = os.path.join(GECKO_PATH, "comm/python/l10n")
sys.path.insert(1, MOZHARNESS)
sys.path.insert(1, COMM_PYTHON_L10N)

from zstandard import ZstdCompressor

from mozharness.base.script import BaseScript
from mozharness.base.vcs.vcsbase import VCSMixin
from mozharness.mozilla.automation import AutomationMixin
from mozharness.mozilla.l10n.locales import LocalesMixin
from mozpack.archive import create_tar_from_files
from mozpack.copier import FileRegistry
from mozpack.files import FileFinder
from tbxchannel.l10n_merge import COMM_STRINGS_PATTERNS, GECKO_STRINGS_PATTERNS


class CommMultiLocale(LocalesMixin, AutomationMixin, VCSMixin, BaseScript):
    config_options = [
        [
            [
                "--locale-list",
            ],
            {
                "action": "store",
                "dest": "locale_list",
                "type": "string",
                "help": "File with locales to include. Either all-locales or shipped-locales",
            },
        ],
        [
            [
                "--comm-locales-file",
            ],
            {
                "action": "store",
                "dest": "comm_locales_file",
                "type": "string",
                "help": "File with HG revision of comm-l10n monorepo to use",
            },
        ],
        [
            [
                "--browser-locales-file",
            ],
            {
                "action": "store",
                "dest": "locales_file",
                "type": "string",
                "help": "File with HG revisions of l10n-central repositories",
            },
        ],
    ]

    def __init__(self, require_config_file=False):
        buildscript_kwargs = {
            "all_actions": [
                "clone-gecko-locales",
                "clone-comm-locales",
                "merge-repos",
                "pack-merged",
                "gen-changesets",
            ],
            "config": {
                "ignore_locales": ["en-US"],
                "log_name": "multi_locale",
                "merged_dir": "l10n_merged",
                "objdir": "obj-build",
                "upload_file": "strings_all.tar.zst",
                "changesets_file": "l10n-changesets.json",
            },
        }

        LocalesMixin.__init__(self)
        BaseScript.__init__(
            self,
            config_options=self.config_options,
            require_config_file=require_config_file,
            **buildscript_kwargs,
        )
        self.upload_env = None
        self.file_registry = None
        self.comm_l10n_revision = None

    def query_abs_dirs(self):
        if self.abs_dirs:
            return self.abs_dirs
        abs_dirs = super(CommMultiLocale, self).query_abs_dirs()
        c = self.config
        dirs = {}
        dirs["abs_checkout_dir"] = os.path.abspath(os.path.join(abs_dirs["abs_src_dir"], ".."))
        dirs["abs_work_dir"] = os.path.join(c["base_work_dir"], c["work_dir"])
        # Needs to match abs_dirs["abs_l10n_dir"] set in mozharness.mozilla.l10n.locales
        dirs["abs_l10n_central_dir"] = os.path.abspath(
            os.path.join(dirs["abs_checkout_dir"], "l10n-central")
        )
        dirs["abs_comm_l10n_dir"] = os.path.abspath(
            os.path.join(dirs["abs_checkout_dir"], "comm-l10n")
        )
        dirs["abs_merged_dir"] = os.path.abspath(
            os.path.join(dirs["abs_work_dir"], "l10n-central")
        )
        for key in dirs.keys():
            if key not in abs_dirs:
                abs_dirs[key] = dirs[key]
        self.abs_dirs = abs_dirs
        return self.abs_dirs

    def _query_upload_env(self):
        """returns the environment used for the upload step"""
        if self.upload_env:
            return self.upload_env
        config = self.config

        upload_env = self.query_env(partial_env=config.get("upload_env"))

        self.upload_env = upload_env
        return self.upload_env

    def _ensure_upload_path(self):
        env = self._query_upload_env()
        if "UPLOAD_PATH" in env and not os.path.exists(env["UPLOAD_PATH"]):
            self.mkdir_p(env["UPLOAD_PATH"])

    def get_gecko_l10n_revisions(self):
        # Populate self.locales with Thunderbird's locales, and revisions
        # from browser/locales/l10n-changesets.json
        c = self.config
        ignore_locales = c.get("ignore_locales", [])

        dirs = self.query_abs_dirs()
        locale_list = os.path.join(dirs["abs_src_dir"], c["locale_list"])
        locales = self.parse_locales_file(locale_list)
        locale_changesets_file = os.path.join(dirs["abs_src_dir"], c["locales_file"])
        # parse_locales_file fills in self.l10n_revisions with changesets
        self.parse_locales_file(locale_changesets_file)

        for locale in ignore_locales:
            if locale in locales:
                self.debug("Ignoring locale %s." % locale)
                locales.remove(locale)

        self.locales = locales

    # Actions {{{2
    def clone_gecko_locales(self):
        self.get_gecko_l10n_revisions()
        self.pull_locale_source()

    def clone_comm_locales(self):
        c = self.config
        dirs = self.query_abs_dirs()

        locales_file = os.path.join(dirs["abs_src_dir"], c["comm_locales_file"])
        locales_data = {}
        if locales_file.endswith(".json"):
            with open(locales_file) as fh:
                locales_data = json.load(fh)
        # would use en-US, but it's not in this file!
        self.comm_l10n_revision = locales_data.get("en-GB", {}).get("revision")

        git_repository = c.get("comm_git_repository")
        hg_repository = c.get("hg_comm_l10n_repo")
        if git_repository:
            checkout_args = {
                "repo": git_repository,
                "vcs": "gittool",
                "revision": self.comm_l10n_revision,
            }
            repo_name = "thunderbird-l10n"
        else:
            checkout_args = {"repo": hg_repository, "vcs": "hg", "branch": self.comm_l10n_revision}
            repo_name = "comm-l10n"

        if self.comm_l10n_revision:
            self.mkdir_p(dirs["abs_checkout_dir"])
            self.vcs_checkout(
                dest=dirs["abs_comm_l10n_dir"],
                **checkout_args,
            )
        else:
            raise Exception(
                f"Unable to find revision {self.comm_l10n_revision} in {repo_name} repo using "
                f"{c['comm_locales_file']}."
            )

    def merge_repos(self):
        dirs = self.query_abs_dirs()
        if os.path.exists(dirs["abs_merged_dir"]):
            self.rmtree(dirs["abs_merged_dir"])

        file_registry = FileRegistry()

        def add_to_registry(base_path, patterns):
            finder = FileFinder(base_path)
            for pattern in patterns:
                for _lang in self.locales:
                    for _filepath, _fileobj in finder.find(pattern.format(lang=_lang)):
                        _filepath = os.path.join("l10n-central", _filepath)
                        file_registry.add(_filepath, _fileobj)

        add_to_registry(dirs["abs_l10n_central_dir"], GECKO_STRINGS_PATTERNS)
        add_to_registry(dirs["abs_comm_l10n_dir"], COMM_STRINGS_PATTERNS)

        self.file_registry = file_registry

    def pack_merged(self):
        self._ensure_upload_path()
        upload_path = self.config["upload_env"]["UPLOAD_PATH"]
        archive_path = os.path.join(upload_path, self.config["upload_file"])

        with open(archive_path, "wb") as f:
            with ZstdCompressor().stream_writer(f) as z:
                create_tar_from_files(z, dict(self.file_registry))

    def gen_changesets(self):
        # self.l10n_revisions has the gecko string revs
        gecko_l10n_revisions = {}
        for l in self.locales:
            gecko_l10n_revisions[l] = {
                "repo": f"{self.config['hg_l10n_base']}/{l}",
                "revision": self.l10n_revisions[l],
            }

        changeset_data = {
            "gecko_strings": gecko_l10n_revisions,
            "comm_strings": {
                "repo": self.config["hg_comm_l10n_repo"],
                "revision": self.comm_l10n_revision,
            },
        }
        upload_path = self.config["upload_env"]["UPLOAD_PATH"]
        changesets_file = os.path.join(upload_path, self.config["changesets_file"])
        with open(changesets_file, "w") as f:
            json.dump(changeset_data, f, sort_keys=True, indent=2)


if __name__ == "__main__":
    single_locale = CommMultiLocale()
    single_locale.run_and_exit()
