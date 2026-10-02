# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Compute the release notes and pushlog links used by the smoke test email.
"""

from typing import Optional

from mozilla_version.gecko import ThunderbirdVersion
from taskgraph.transforms.base import TransformSequence
from taskgraph.util.taskcluster import get_session

transforms = TransformSequence()
strip_transforms = TransformSequence()

GIT_REPOSITORY = "https://github.com/thunderbird/thunderbird-desktop"
THUNDERBIRD_VERSIONS = "https://product-details.mozilla.org/1.0/thunderbird_versions.json"


def get_thunderbird_versions() -> dict[str, str]:
    response = get_session().get(THUNDERBIRD_VERSIONS, timeout=60)
    response.raise_for_status()
    return response.json()


def get_previous_version(parsed: ThunderbirdVersion) -> Optional[str]:
    major = parsed.major_number
    latest_releases = get_thunderbird_versions()

    if parsed.is_beta:
        return latest_releases["LATEST_THUNDERBIRD_DEVEL_VERSION"]
    elif parsed.is_esr:
        for key in ("THUNDERBIRD_ESR", "THUNDERBIRD_ESR_NEXT"):
            if ThunderbirdVersion.parse(latest_releases[key]).major_number == major:
                return latest_releases[key]
        # The first build of a new ESR has no shipped release on its branch to
        # compare against, so the email links to its release tag instead.
        return None
    else:
        return latest_releases["LATEST_THUNDERBIRD_VERSION"]


def release_tag(version, suffix) -> str:
    return "THUNDERBIRD_{}_{}".format(version.replace(".", "_"), suffix)


@transforms.add
def add_smoke_test_links(config, jobs):
    version = config.params["version"]
    build_number = config.params["build_number"]

    parsed = ThunderbirdVersion.parse(version)
    previous = get_previous_version(parsed)

    notes_version = f"{parsed.major_number}.0beta" if parsed.is_beta else version

    if previous:
        pushlog = "{}/compare/{}...{}".format(
            GIT_REPOSITORY,
            release_tag(previous, "RELEASE"),
            release_tag(version, f"BUILD{build_number}"),
        )
    else:
        pushlog = "{}/releases/tag/{}".format(
            GIT_REPOSITORY, release_tag(version, f"BUILD{build_number}")
        )

    for job in jobs:
        job["smoke-test"] = {
            "release-notes-url": f"https://stage.thunderbird.net/en-US/thunderbird/{notes_version}/releasenotes/",
            "pushlog-url": pushlog,
        }
        yield job


@strip_transforms.add
def remove_smoke_test_links(config, jobs):
    for job in jobs:
        job.pop("smoke-test", None)
        yield job
