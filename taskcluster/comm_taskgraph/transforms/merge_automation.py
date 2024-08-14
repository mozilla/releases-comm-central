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
from taskgraph.util.schema import resolve_keyed_by

from comm_taskgraph import COMM

transforms = TransformSequence()

MOZ_HG_URL = "https://hg.mozilla.org/releases/{repo}"
MOZ_HG_TB_VERSION_URL = "{repo_base_url}/raw-file/tip/mail/config/version.txt"
MOZ_HG_TB_GECKO_REV_URL = "{repo_base_url}/raw-file/tip/.gecko_rev.yml"
MOZ_HG_TAG_URL = "https://hg.mozilla.org/releases/{repo}/json-tags"


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


def get_upstream_tag(tag_regex, base_regex, repo):
    base_tag_matcher = re.compile(base_regex)
    release_tag_matcher = re.compile(tag_regex)

    def check_match(tag_name):
        return release_tag_matcher.match(tag_name)

    def check_base_match(tag_name):
        return base_tag_matcher.match(tag_name)

    j = get_json_tags(repo)

    for tag in j["tags"]:
        m = check_match(tag["tag"])
        if m:
            print("Found matching tag: {}".format(m.group(0)))
            print("Tag: {}".format(tag["tag"]))
            print("Rev: {}".format(tag["node"]))
            return {"tag": tag["tag"], "node": tag["node"]}
        m = check_base_match(tag["tag"])
        if m:
            print("No release/build tag found.")
            print("Using base tag {}".format(m.group(0)))
            print("Tag: {}".format(tag["tag"]))
            print("Rev: {}".format(tag["node"]))
            return {"tag": tag["tag"], "node": tag["node"]}

    raise Exception("Unable to find a suitable upstream tag!")


def mk_gecko_rev_replacement(key, old, new):
    """
    Build a replacement structure for Treescript.
    The return value is applied to the overall replacements list via .extend().
    In the case where the value does not change, an empty list is returned
    so .extend() has no effect.
    """
    rv = []
    if new != old:
        rv.append([".gecko_rev.yml", f"{key}: {old}", f"{key}: {new}"])
    return rv


@transforms.add
def pin_gecko_rev_yml(config, tasks):
    for task in tasks:
        if "merge_config" not in config.params:
            break

        resolve_keyed_by(
            task,
            "worker.gecko-rev",
            item_name=task["name"],
            **{
                "project": config.params["project"],
                "release-type": config.params["release_type"],
                "behavior": config.params["merge_config"]["behavior"],
            },
        )

        merge_config = task["worker"]["merge-info"]
        if gecko_rev := task["worker"].pop("gecko-rev", None):
            source_repo = merge_config[gecko_rev["source"]]
            gecko_head_repo = MOZ_HG_URL.format(repo=gecko_rev["upstream"])

            gecko_rev_yml = get_gecko_rev_yml(source_repo)
            thunderbird_version = get_thunderbird_version(source_repo)

            tag_regex = gecko_rev["tag"].format(
                major_version=thunderbird_version.major_number,
                minor_version=thunderbird_version.minor_number,
                minor_version_plus1=thunderbird_version.minor_number + 1,
            )
            base_regex = gecko_rev["base"].format(
                major_version=thunderbird_version.major_number,
                minor_version=thunderbird_version.minor_number,
            )
            tag_data = get_upstream_tag(tag_regex, base_regex, gecko_rev["upstream"])

            replacements = []
            replacements.extend(
                mk_gecko_rev_replacement(
                    "GECKO_HEAD_REPOSITORY",
                    gecko_rev_yml["GECKO_HEAD_REPOSITORY"],
                    gecko_head_repo,
                )
            )
            replacements.extend(
                mk_gecko_rev_replacement(
                    "GECKO_HEAD_REF", gecko_rev_yml["GECKO_HEAD_REF"], tag_data["tag"]
                )
            )
            replacements.extend(
                mk_gecko_rev_replacement(
                    "GECKO_HEAD_REV", gecko_rev_yml["GECKO_HEAD_REV"], tag_data["node"]
                )
            )

            merge_config["replacements"].extend(replacements)

        yield task
