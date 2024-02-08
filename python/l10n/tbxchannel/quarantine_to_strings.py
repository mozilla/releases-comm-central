#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from typing_extensions import Literal

from mozversioncontrol import HgRepository
from mozversioncontrol.repoupdate import update_mercurial_repo

from .l10n_merge import COMM_L10N, COMM_L10N_PUSH, COMM_STRINGS_QUARANTINE

ACTIONS = Literal["clean", "prep", "migrate", "push"]


class HgL10nRepository(HgRepository):
    log_trans_table = str.maketrans({"{": "{{", "}": "}}"})

    def __init__(self, path: Path, check_url=None, logger=print):
        super(HgL10nRepository, self).__init__(path, hg="hg")
        self._logger = logger
        if check_url is not None:
            self._check_hg_url(check_url)

    def logger(self, *args):
        # Escape python-style format string substitutions because Sentry is annoying
        self._logger(*args[:-1], args[-1].translate(self.log_trans_table))

    def _check_hg_url(self, repo_url):
        configured_url = self._run("config", "paths.default").strip()
        if configured_url != repo_url:
            raise Exception(f"Repository does not match {repo_url}.")

    def check_status(self):
        if not self.working_directory_clean() or self.get_outgoing_files():
            raise Exception(f"Repository at {self.path} is not clean, run with 'clean'.")

    def last_convert_rev(self):
        args = (
            "log",
            "-r",
            "last(extra('convert_source', 'comm-strings-quarantine'))",
            "--template",
            "{get(extras,'convert_revision')}\n",
        )
        self.logger(logging.INFO, "last_convert_rev", {}, " ".join(args))
        rv = self._run(*args).strip()
        self.logger(logging.INFO, "last_convert_rev", {}, rv)
        return rv

    def next_convert_rev(self, last_converted):
        args = ("log", "-r", f"first(children({last_converted}))", "--template", "{node}\n")
        self.logger(logging.INFO, "next_convert_rev", {}, " ".join(args))
        rv = self._run(*args).strip()
        self.logger(logging.INFO, "next_convert_rev", {}, rv)
        return rv

    def convert_quarantine(self, strings_path, filemap_path, splicemap_path, next_converted_rev):
        args = (
            "convert",
            "--config",
            "convert.hg.saverev=True",
            "--config",
            "convert.hg.sourcename=comm-strings-quarantine",
            "--config",
            f"convert.hg.revs={next_converted_rev}:tip",
            "--filemap",
            filemap_path,
            "--splicemap",
            splicemap_path,
            "--datesort",
            str(self.path),
            str(strings_path.absolute()),
        )
        self.logger(logging.INFO, "convert_quarantine", {}, " ".join(args))
        rv = self._run(*args)
        self.logger(logging.INFO, "convert_quarantine", {}, rv)
        return rv

    def push(self, push_url):
        popen_kwargs = {
            "stdout": subprocess.PIPE,
            "stderr": subprocess.PIPE,
            "cwd": self.path,
            "env": self._env,
            "universal_newlines": True,
            "bufsize": 1,
        }
        cmd = ("hg", "push", "-r", ".", push_url)
        self.logger(logging.INFO, "push", {}, " ".join(cmd))
        # This function doesn't really push to try...
        self._push_to_try_with_log_capture(cmd, popen_kwargs)


def _nuke_hg_repos(*paths: Path):
    failed = {}
    for path in paths:
        try:
            if path.exists():
                shutil.rmtree(str(path))
        except Exception as e:
            failed[str(path)] = e

    if failed:
        for f in failed:
            print(f"Unable to nuke '{f}': {failed[f]}")
        raise Exception()


def publish_strings(
    command_context,
    quarantine_path: Path,
    comm_l10n_path: Path,
    actions: ACTIONS,
    **kwargs,
):
    if "clean" in actions:
        command_context.log(logging.INFO, "clean", {}, "Removing old repository clones.")
        _nuke_hg_repos(quarantine_path, comm_l10n_path)

    if "prep" in actions:
        # update_mercurial_repo also will clone if a repo is not already there
        command_context.log(
            logging.INFO, "prep", {}, f"Updating comm-strings-quarantine at {quarantine_path}."
        )
        update_mercurial_repo(COMM_STRINGS_QUARANTINE, quarantine_path)
        command_context.log(logging.INFO, "prep", {}, f"Updating comm-l10n at {comm_l10n_path}.")
        update_mercurial_repo(COMM_L10N, comm_l10n_path)

    local_quarantine = HgL10nRepository(
        quarantine_path, COMM_STRINGS_QUARANTINE, command_context.log
    )
    local_comm_l10n = HgL10nRepository(comm_l10n_path, COMM_L10N, command_context.log)

    if "prep" not in actions:
        local_quarantine.update("tip")
        local_comm_l10n.update("tip")

    if "migrate" in actions:
        local_quarantine.check_status()
        local_comm_l10n.check_status()

        command_context.log(
            logging.INFO, "migrate", {}, "Starting string migration from quarantine."
        )
        head_rev = local_comm_l10n.head_ref
        last_convert_rev = local_comm_l10n.last_convert_rev()
        first_convert_rev = local_quarantine.next_convert_rev(last_convert_rev)
        command_context.log(
            logging.INFO, "migrate", {}, f" Last converted rev: {last_convert_rev}"
        )
        command_context.log(
            logging.INFO, "migrate", {}, f" First converted rev: {first_convert_rev}"
        )

        with tempfile.NamedTemporaryFile(
            prefix="splicemap", suffix=".txt", delete=False
        ) as splice_fp:
            splicemap = splice_fp.name
            command_context.log(
                logging.INFO, "migrate", {}, f"  Writing splicemap to: {splicemap}"
            )
            splice_fp.write(f"{first_convert_rev} {head_rev}\n".encode("utf-8"))

        with tempfile.NamedTemporaryFile(prefix="filemap", suffix=".txt", delete=False) as file_fp:
            filemap = file_fp.name
            command_context.log(logging.INFO, "migrate", {}, f"  Writing filemap to: {filemap}")
            file_fp.writelines(
                ["exclude _configs\n".encode("utf-8"), "rename . en-US\n".encode("utf-8")]
            )

        command_context.log(logging.INFO, "migrate", {}, "  Running hg convert...")
        local_quarantine.convert_quarantine(comm_l10n_path, filemap, splicemap, first_convert_rev)
        try:
            os.unlink(splicemap)
            os.unlink(filemap)
        except Exception:
            pass

        local_comm_l10n.update("tip")
        command_context.log(logging.INFO, "migrate", {}, "  Finished!")

    if "push" in actions:
        if local_comm_l10n.get_outgoing_files():
            command_context.log(logging.INFO, "push", {}, "  Pushing to comm-l10n.")
            local_comm_l10n.push(COMM_L10N_PUSH)
        else:
            command_context.log(logging.INFO, "push", {}, "Skipping empty push.")
