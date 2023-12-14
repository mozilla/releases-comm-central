# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Fix-ups for comm-central merge automation
"""

import json
import os
import re
import urllib.request

import yaml
from mozilla_version.gecko import GeckoVersion
from taskgraph.transforms.base import TransformSequence

from comm_taskgraph import COMM

transforms = TransformSequence()

MOZ_HG_URL = "https://hg.mozilla.org/releases/{repo}"
MOZ_HG_TB_VERSION_URL = "{repo_base_url}/raw-file/tip/mail/config/version.txt"
MOZ_HG_TB_GECKO_REV_URL = "{repo_base_url}/raw-file/tip/.gecko_rev.yml"
MOZ_HG_TAG_URL = "https://hg.mozilla.org/releases/{repo}/json-tags"
# Matcher for RELEASE_BASE tags (used for late betas)
BASE_TAG_RE = r"^FIREFOX_RELEASE_{major_version}_BASE$"
# Most recent tag that's a RELEASE or BUILD1
RELEASE_TAG_RE = r"^FIREFOX_{major_version}_{minor_version}[\dbesr_]+(RELEASE|BUILD\d)$"

BEHAVIOR_2_GECKO_REPO = {
    "comm-beta-to-release": "mozilla-release",
    "comm-release-to-esr": "mozilla-esr115",
    "comm-bump-esr115": "mozilla-esr115",
}


def do_suite_verbump(replacements):
    """Bump the minor version of suite version files."""
    allowed_files = ("suite/config/version.txt", "suite/config/version_display.txt")
    old_version, new_version = None, None

    new_replacements = []
    for file, old, new in replacements:
        if file not in allowed_files:
            break
        if old_version is None or new_version is None:
            path = os.path.join(COMM, file)
            data = open(path).read()
            match = re.match(r"^(2)\.(\d+)(a1)$", data)
            if match:
                old_version = match.group(0)

                old_minor = match.group(2)
                new_minor = str(int(old_minor) + 1)

                new_version = f"{match.group(1)}.{new_minor}{match.group(3)}"

        new_replacements.append([file, old_version, new_version])

    if len(new_replacements) == len(replacements):
        return new_replacements
    else:
        raise Exception(f"do_suite_version failed: {replacements}, {new_replacements}")


@transforms.add
def update_suite_versions(config, tasks):
    for task in tasks:
        if "merge_config" not in config.params:
            break
        behavior = config.params["merge_config"]["behavior"]
        if behavior == "comm-bump-central":
            merge_config = task["worker"]["merge-info"]
            replacements = merge_config["replacements"]
            merge_config["replacements"] = do_suite_verbump(replacements)

        yield task


def get_json_tags(repo):
    url = MOZ_HG_TAG_URL.format(repo=repo)
    res = urllib.request.urlopen(url)
    res_body = res.read()

    j = json.loads(res_body.decode("utf-8"))
    return j


def get_thunderbird_version(repo_base_url):
    version_url = MOZ_HG_TB_VERSION_URL.format(repo_base_url=repo_base_url)
    res = urllib.request.urlopen(version_url)
    res_body = res.read().decode("utf-8").strip()
    return GeckoVersion.parse(res_body)


def get_gecko_rev_yml(repo_base_url):
    url = MOZ_HG_TB_GECKO_REV_URL.format(repo_base_url=repo_base_url)
    res = urllib.request.urlopen(url)
    data = res.read().decode("utf-8")
    return yaml.safe_load(data)


def get_last_tag(version, repo):
    base_tag_regex = BASE_TAG_RE.format(major_version=version.major_number)
    release_tag_regex = RELEASE_TAG_RE.format(
        major_version=version.major_number, minor_version=version.minor_number
    )
    base_tag_matcher = re.compile(base_tag_regex)
    release_tag_matcher = re.compile(release_tag_regex)

    def check_match(tag_name):
        base_m = base_tag_matcher.match(tag_name)
        rel_m = release_tag_matcher.match(tag_name)
        return base_m or rel_m

    j = get_json_tags(repo)

    for i in range(0, 10):
        tag = j["tags"][i]
        m = check_match(tag["tag"])
        if m:
            print("Found matching tag: {}".format(m.group(0)))

            print("Tag: {}".format(tag["tag"]))
            print("Rev: {}".format(tag["node"]))
            return {"tag": tag["tag"], "node": tag["node"]}

    raise Exception("No release tag found in first 10 tags downloaded.")


def mk_gecko_rev_replacement(key, old, new):
    rv = [".gecko_rev.yml", f"{key}: {old}", f"{key}: {new}"]
    return rv


@transforms.add
def pin_gecko_rev_yml(config, tasks):
    for task in tasks:
        if "merge_config" not in config.params:
            break

        behavior = config.params["merge_config"]["behavior"]
        if behavior in BEHAVIOR_2_GECKO_REPO:
            gecko_repo = BEHAVIOR_2_GECKO_REPO[behavior]

            merge_config = task["worker"]["merge-info"]
            if behavior == "comm-bump-esr115":
                thunderbird_version = get_thunderbird_version(merge_config["to-repo"])
                gecko_rev_yml = get_gecko_rev_yml(merge_config["to-repo"])
            else:
                thunderbird_version = get_thunderbird_version(merge_config["from-repo"])
                gecko_rev_yml = get_gecko_rev_yml(merge_config["from-repo"])

            tag_data = get_last_tag(thunderbird_version, gecko_repo)
            replacements = merge_config["replacements"]
            replacements.append(
                mk_gecko_rev_replacement(
                    "GECKO_HEAD_REF", gecko_rev_yml["GECKO_HEAD_REF"], tag_data["tag"]
                )
            )
            replacements.append(
                mk_gecko_rev_replacement(
                    "GECKO_HEAD_REV", gecko_rev_yml["GECKO_HEAD_REV"], tag_data["node"]
                )
            )

        yield task
