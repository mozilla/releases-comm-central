# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this,
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Download and combine translations from l10n-central and comm-l10n for
use by mach build installers-$AB_CD and mach build langpack-$AB_CD.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Union

from mozpack.copier import FileCopier
from mozpack.files import FileFinder
from mozversioncontrol import get_tool_path
from mozversioncontrol.repoupdate import update_git_repo as clone_git_repo

COMM_PATH = (Path(__file__).parent / "../../..").resolve()
GECKO_PATH = COMM_PATH.parent
COMM_PYTHON_L10N = os.path.join(COMM_PATH, "python/l10n")
sys.path.insert(1, COMM_PYTHON_L10N)

from tb_l10n.l10n_merge import (
    COMM_STRINGS_PATTERNS,
    FIREFOX_L10N,
    GECKO_STRINGS_PATTERNS,
    THUNDERBIRD_L10N,
)

ALL_LOCALES = [l.rstrip() for l in (COMM_PATH / "mail/locales/all-locales").open().readlines()]


def tb_locale(locale):
    if locale in ALL_LOCALES:
        return locale
    raise argparse.ArgumentTypeError("Locale {} invalid.".format(locale))


def update_git_repo(repo: str, path: Union[str, Path], revision="main"):
    clone_git_repo(repo, path)

    git = get_tool_path("git")
    revision = f"{revision}^0"
    subprocess.check_call([git, "checkout", "-q", "-f", revision], cwd=str(path))


def get_revision(project, locale):
    json_file = {
        "browser": GECKO_PATH / "browser/locales/l10n-changesets.json",
        "mail": COMM_PATH / "mail/locales/l10n-changesets.json",
    }.get(project)
    if json_file is None:
        raise Exception(f"Invalid project {project} for l10n-changesets.json!")

    with open(json_file) as fp:
        changesets = json.load(fp)

    revision = changesets.get(locale, {}).get("revision")
    if revision is None:
        raise Exception(f"Locale {locale} not found in {project} l10n-changesets.json!")

    return revision


def get_strings_repos(locale, destination):
    with tempfile.TemporaryDirectory() as tmproot:
        firefox_l10n_path = Path(tmproot) / "firefox-l10n"
        central_revision = get_revision("browser", locale)
        update_git_repo(FIREFOX_L10N, firefox_l10n_path, revision=central_revision)

        thunderbird_l10n_path = Path(tmproot) / "thunderbird-l10n"
        comm_revision = get_revision("mail", locale)
        update_git_repo(THUNDERBIRD_L10N, thunderbird_l10n_path, revision=comm_revision)

        file_copier = FileCopier()

        def add_to_registry(base_path, patterns):
            finder = FileFinder(str(base_path))
            for pattern in patterns:
                for _filepath, _fileobj in finder.find(pattern.format(lang=locale)):
                    file_copier.add(_filepath, _fileobj)

        add_to_registry(firefox_l10n_path, GECKO_STRINGS_PATTERNS)
        add_to_registry(thunderbird_l10n_path, COMM_STRINGS_PATTERNS)

        file_copier.copy(str(destination))


def main():
    parser = argparse.ArgumentParser(description="Download translated strings from comm-l10n")
    parser.add_argument("locale", help="The locale to download", type=tb_locale)
    parser.add_argument("dest_path", help="Path where locale will be downloaded to.", type=Path)

    args = parser.parse_args()
    get_strings_repos(args.locale, args.dest_path)


if __name__ == "__main__":
    main()
