# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


def test(mod, path, entity=None):
    import re

    # ignore anything but SeaMonkey
    if mod not in (
        "netwerk",
        "dom",
        "toolkit",
        "security/manager",
        "devtools/client",
        "devtools/shared",
        "devtools/startup",
        "suite",
        "extensions/spellcheck",
        "suite/branding/seamonkey",
        "services/sync",
    ):
        return "ignore"
    # ignore temporary files, hiden files and files from rejects
    if (
        re.match(r".*?\/[.#].+", path)
        or re.match(r".*~$", path)
        or re.match(r".+\.(orig|rej)", path)
    ):
        return "ignore"
    if mod not in ("suite"):
        # we only have exceptions for suite
        return "error"
    if entity is None:
        # missing and obsolete files
        return (
            "ignore"
            if (
                re.match(r"searchplugins\/.+\.xml", path)
                or path == "profile/bookmarks.extra"
                or path == "profile/panels.extra"
                or path == "defines.inc"
                or re.match(r"chrome\/common\/help\/images\/[A-Za-z-_]+\.[a-z]+", path)
            )
            else "error"
        )
    if path == "defines.inc":
        return "ignore" if (entity == "MOZ_LANGPACK_CONTRIBUTORS") else "error"

    if path == "chrome/common/region.properties":
        return (
            "ignore"
            if (re.match(r"browser\.search\.order\.[1-9]", entity))
            else "error"
        )

    if path == "chrome/mailnews/region.properties":
        return (
            "ignore"
            if (re.match(r"mail\.addr_book\.mapit_url\.[1-5]", entity))
            else "error"
        )

    if path != "chrome/browser/region.properties":
        # only region.properties exceptions remain, compare all others
        return "error"

    return (
        "ignore"
        if (re.match(r"browser\.contentHandlers\.types\.[0-5]", entity))
        else "error"
    )
