#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import os
import re
import sys
import urllib.error
import urllib.request

import yaml


def main() -> int:
    # Check for required variables
    branch = os.environ.get("BRANCH")
    version = os.environ.get("VERSION")
    if not branch or not version:
        print("BRANCH and VERSION environment variables must be set", file=sys.stderr)
        return 1

    # Strip trailing digits from branch (i.e. "esr140" becomes "esr")
    channel = re.sub(r"\d+$", "", branch)

    # Extract semantic version number (version without suffix) from version string
    sem_ver = re.match(r"^[^a-z]*", version).group(0)

    # Construct URL to YAML notes file
    base = "https://raw.githubusercontent.com/thunderbird/thunderbird-notes/refs/heads/prod"
    suffix = "" if channel == "release" else channel
    url = f"{base}/{channel}/{sem_ver}{suffix}.yml"

    # Download notes (if they exist)
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            notes = yaml.safe_load(r.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError, yaml.YAMLError):
        notes = None

    # If notes do not exist
    if not notes:
        print(
            f"Release notes for Thunderbird {version} not found on the prod branch of thunderbird-notes"
        )
        return 1

    # If channel is beta, extract the number of releases in notes file
    if channel == "beta":
        # Extract beta number from version
        beta_regex = re.search(r"b(\d+)$", version)
        beta_num = int(beta_regex.group(1)) if beta_regex else 0

        # Extract the number of releases in notes file
        groups = (notes.get("release") or {}).get("groups") or []

        # If release does not exist in notes file
        if len(groups) < beta_num:
            print(
                f"Release notes for Thunderbird {version} not found on the prod branch of thunderbird-notes"
            )
            return 1

    # Success!
    print(f"Release notes for Thunderbird {version} are published on prod")
    return 0


if __name__ == "__main__":
    sys.exit(main())
