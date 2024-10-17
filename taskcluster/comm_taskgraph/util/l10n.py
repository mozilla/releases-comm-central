# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


def read_locales_file(locales_file):
    """Parse the passed locales file for a list of locales, exclude ja-JP-mac."""
    with open(locales_file, mode="r") as fp:
        locales = [l for l in fp.read().split() if not l.startswith("ja-JP-mac")]

    return locales
