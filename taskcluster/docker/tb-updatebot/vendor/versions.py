#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""
Pick the upstream release tag a third party library should be updated to.
"""

import re
from typing import Iterable, List, NamedTuple, Optional

DEFAULT_TAG_PATTERN = r"v?(\d+)\.(\d+)(?:\.(\d+))?"

# Libraries whose release tags don't match DEFAULT_TAG_PATTERN.
CUSTOM_TAG_PATTERNS = {
    # json-c-0.16-20220414
    "json-c": r"json-c-(\d+)\.(\d+)(?:\.(\d+))?-\d{8}",
}


class Version(NamedTuple):
    major: int
    minor: int
    patch: int


def parse_tag(tag: str, pattern: str = DEFAULT_TAG_PATTERN) -> Optional[Version]:
    """pattern must fully match the tag and capture major, minor and an optional patch."""
    match = re.fullmatch(pattern, tag)
    if not match:
        return None
    major, minor, patch = match.groups()
    return Version(int(major), int(minor), int(patch or 0))


def parse_ls_remote(output: str) -> List[str]:
    """Tag names from the output of `git ls-remote --tags --refs`."""
    tags = []
    for line in output.splitlines():
        _, _, ref = line.partition("\t")
        if ref.startswith("refs/tags/"):
            tags.append(ref.removeprefix("refs/tags/"))
    return tags


def select_update(
    current_tag: str,
    tags: Iterable[str],
    stable: bool,
    pattern: str = DEFAULT_TAG_PATTERN,
) -> Optional[str]:
    """Return the tag to update to, or None when there is nothing newer to take.

    stable: only take patch releases of the current major.minor. Otherwise take
    the newest release of the current major, and move to the newest release of
    the next major only once the current major has nothing newer.
    """
    current = parse_tag(current_tag, pattern)
    if current is None:
        raise ValueError(f"Current revision {current_tag} does not match {pattern}")

    newer = {}
    for tag in tags:
        version = parse_tag(tag, pattern)
        if version and version > current:
            newer.setdefault(version, tag)

    if stable:
        candidates = [v for v in newer if v[:2] == current[:2]]
    else:
        candidates = [v for v in newer if v.major == current.major]
        if not candidates and newer:
            next_major = min(v.major for v in newer)
            candidates = [v for v in newer if v.major == next_major]

    if not candidates:
        return None
    return newer[max(candidates)]
