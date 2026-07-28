#!/usr/bin/env python3

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Vendor the axe-core browser bundle from the published npm package."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import posixpath
import shutil
import sys
import tarfile
import tempfile
import urllib.request


PACKAGE_NAME = "axe-core"
REGISTRY_URL = f"https://registry.npmjs.org/{PACKAGE_NAME}"
VENDORED_FILES = (
    "LICENSE",
    "LICENSE-3RD-PARTY.txt",
    "README.md",
    "axe.min.js",
    "package.json",
)


class AxeCoreNpmHost:
    """Source-host adapter used by mach vendor for npm-hosted axe-core."""

    def __init__(self, manifest):
        self.manifest = manifest

    def upstream_commit(self, revision):
        """Return (version, release timestamp) for the requested npm version."""
        metadata = fetch_package_metadata()
        version = normalize_revision(revision, metadata)
        if version not in metadata["versions"]:
            raise ValueError(f"{PACKAGE_NAME} version {version} was not found")
        return version, metadata["time"][version]

    def upstream_tag(self, revision):
        return self.upstream_commit(revision)


def fetch_json(url):
    with urllib.request.urlopen(url) as response:
        return json.load(response)


def fetch_bytes(url):
    with urllib.request.urlopen(url) as response:
        return response.read()


def fetch_package_metadata():
    return fetch_json(REGISTRY_URL)


def normalize_revision(revision, metadata):
    if not revision or revision in {"HEAD", "latest", "tip"}:
        return metadata["dist-tags"]["latest"]
    return revision[1:] if revision.startswith("v") else revision


def verify_integrity(data, integrity):
    algorithm, encoded_hash = integrity.split("-", 1)
    if algorithm != "sha512":
        raise ValueError(f"Unsupported npm integrity algorithm: {algorithm}")

    expected = base64.b64decode(encoded_hash)
    actual = hashlib.sha512(data).digest()
    if not hmac.compare_digest(expected, actual):
        raise ValueError("Downloaded axe-core tarball failed integrity check")


def package_member_name(filename):
    return posixpath.join("package", filename)


def copy_vendored_files(tarball_path, vendor_dir):
    with tarfile.open(tarball_path, "r:gz") as archive:
        members = {member.name: member for member in archive.getmembers()}
        for filename in VENDORED_FILES:
            member_name = package_member_name(filename)
            if member_name not in members:
                raise ValueError(f"{member_name} was not found in npm package")

            member = members[member_name]
            if not member.isfile():
                raise ValueError(f"{member_name} is not a regular file")

            source = archive.extractfile(member)
            if source is None:
                raise ValueError(f"Could not read {member_name}")

            destination_path = os.path.join(vendor_dir, filename)
            with source, open(destination_path, "wb") as destination:
                shutil.copyfileobj(source, destination)


def vendor(version):
    metadata = fetch_package_metadata()
    normalized_version = normalize_revision(version, metadata)
    version_metadata = metadata["versions"][normalized_version]
    tarball_url = version_metadata["dist"]["tarball"]
    integrity = version_metadata["dist"]["integrity"]

    tarball = fetch_bytes(tarball_url)
    verify_integrity(tarball, integrity)

    vendor_dir = os.path.dirname(os.path.abspath(__file__))
    with tempfile.NamedTemporaryFile(suffix=".tgz") as temp_file:
        temp_file.write(tarball)
        temp_file.flush()
        copy_vendored_files(temp_file.name, vendor_dir)

    print(f"Vendored {PACKAGE_NAME} {normalized_version}")


def main(args):
    if len(args) != 1:
        print(f"Usage: {os.path.basename(__file__)} VERSION", file=sys.stderr)
        return 1

    vendor(args[0])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
