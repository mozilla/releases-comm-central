# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this,
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from pathlib import Path


def get_thunderbird_xc_config(topsrcdir, strings_path):
    assert isinstance(topsrcdir, Path)
    assert isinstance(strings_path, Path)
    return {
        "strings": {
            "path": strings_path,
            "url": "https://hg.mozilla.org/users/thunderbird_calypsoblue.org/comm-strings-quarantine/",  # NOQA: E501
            "heads": {"default": "default"},
            "update_on_pull": True,
            "push_url": "ssh://hg.mozilla.org/users/thunderbird_calypsoblue.org/comm-strings-quarantine/",  # NOQA: E501
        },
        "source": {
            "comm-central": {
                "path": topsrcdir / "comm",
                "url": "https://hg.mozilla.org/comm-central/",
                "heads": {
                    # This list of repositories is ordered, starting with the
                    # one with the most recent content (central) to the oldest
                    # (ESR). In case two ESR versions are supported, the oldest
                    # ESR goes last (e.g. esr78 goes after esr91).
                    "comm": "comm-central",
                    "comm-beta": "releases/comm-beta",
                    "comm-esr91": "releases/comm-esr91",
                },
                "config_files": [
                    "comm/calendar/locales/l10n.toml",
                    "comm/mail/locales/l10n.toml",
                    "comm/suite/locales/l10n.toml",
                ],
            },
        },
    }
