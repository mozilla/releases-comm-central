# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import fileinput
import os.path

from packaging.version import parse


def rnp_version(version_file):
    """
    Read version.txt and return the parsed version.
    :param string version_file:
    :returns version:
    """
    with open(version_file) as fp:
        version_str = fp.readline(512).strip()

    return version_str, parse(version_str)


def rnp_version_defines(version_file, thunderbird_version, crypto_backend):
    """
    Get DEFINES needed for RNP includes generated at build time
    :param string version_file:
    :param string thunderbird_version:
    :param string crypto_backend:
    """
    version_str, version = rnp_version(version_file)
    version_major = version.major
    version_minor = version.minor
    version_patch = version.micro

    version_full = f"{version_str}.MZLA.{thunderbird_version}.{crypto_backend}"

    defines = dict(
        RNP_VERSION_MAJOR=version_major,
        RNP_VERSION_MINOR=version_minor,
        RNP_VERSION_PATCH=version_patch,
        RNP_VERSION=version_str,
        RNP_VERSION_FULL=version_full,
        # Follow upstream's example when commit info is unavailable
        RNP_VERSION_COMMIT_TIMESTAMP="0",
        PACKAGE_STRING=f'"rnp {version_full}"',
    )

    return defines


def main():
    HERE = os.path.dirname(__file__)
    TOPSRCDIR = os.path.abspath(os.path.join(HERE, "../../../../"))
    RNPLIB = os.path.join(TOPSRCDIR, "comm/mail/extensions/openpgp/content/modules/RNPLib.sys.mjs")
    RNPVERSION = os.path.join(TOPSRCDIR, "comm/third_party/rnp/version.txt")

    _, version = rnp_version(RNPVERSION)

    with fileinput.input(files=(RNPLIB,), inplace=True) as f:
        for line in f:
            if line.startswith("const MIN_RNP_VERSION ="):
                line = (
                    f"const MIN_RNP_VERSION = [{version.major}, {version.minor}, {version.micro}];"
                )
            print(line.rstrip())


if __name__ == "__main__":
    main()
