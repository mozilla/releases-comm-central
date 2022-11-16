# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this,
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Download and combine translations from l10n-central and comm-l10n for
use by mach build installers-$AB_CD and mach build langpack-$AB_CD.
"""

import argparse
import os
import sys
import tempfile
from pathlib import Path

from mozpack.copier import FileCopier
from mozpack.files import FileFinder
from mozversioncontrol.repoupdate import update_mercurial_repo

COMM_PATH = (Path(__file__).parent / "../../..").resolve()
COMM_PYTHON_L10N = os.path.join(COMM_PATH, "python/l10n")
sys.path.insert(1, COMM_PYTHON_L10N)

from tbxchannel.l10n_merge import (
    COMM_L10N,
    L10N_CENTRAL,
    COMM_STRINGS_PATTERNS,
    GECKO_STRINGS_PATTERNS,
)

ALL_LOCALES = [
    l.rstrip() for l in (COMM_PATH / "mail/locales/all-locales").open().readlines()
]


def tb_locale(locale):
    if locale in ALL_LOCALES:
        return locale
    raise argparse.ArgumentTypeError("Locale {} invalid.".format(locale))


def get_strings_repos(locale, destination):
    with tempfile.TemporaryDirectory() as tmproot:
        central_url = "{}/{}".format(L10N_CENTRAL, locale)
        l10n_central = Path(tmproot) / "l10n-central"
        l10n_central.mkdir()
        central_path = l10n_central / locale
        update_mercurial_repo("hg", central_url, central_path)

        comm_l10n = Path(tmproot) / "comm-l10n"
        update_mercurial_repo("hg", COMM_L10N, comm_l10n)

        file_copier = FileCopier()

        def add_to_registry(base_path, patterns):
            finder = FileFinder(base_path)
            for pattern in patterns:
                for _filepath, _fileobj in finder.find(pattern.format(lang=locale)):
                    # _filepath = os.path.join("l10n-central", _filepath)
                    file_copier.add(_filepath, _fileobj)

        add_to_registry(l10n_central, GECKO_STRINGS_PATTERNS)
        add_to_registry(comm_l10n, COMM_STRINGS_PATTERNS)

        file_copier.copy(destination / locale)


def main():
    parser = argparse.ArgumentParser(
        description="Download translated strings from comm-l10n"
    )
    parser.add_argument("locale", help="The locale to download", type=tb_locale)
    parser.add_argument(
        "dest_path", help="Path where locale will be downloaded to.", type=Path
    )

    args = parser.parse_args()
    get_strings_repos(args.locale, args.dest_path)


if __name__ == "__main__":
    main()
