# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Vendor the Squire browser module from the published npm package."""

import base64
import hashlib
import io
import json
import sys
import tarfile
import urllib.request
from pathlib import Path

REGISTRY_URL = "https://registry.npmjs.org/squire-rte"


def fetch(url):
    with urllib.request.urlopen(url) as response:
        return response.read()


class SquireNpmHost:
    def __init__(self, manifest):
        self.manifest = manifest

    def upstream_commit(self, revision):
        metadata = json.loads(fetch(REGISTRY_URL))
        if not revision or revision in {"HEAD", "latest", "tip"}:
            revision = metadata["dist-tags"]["latest"]
        revision = revision.removeprefix("v")
        return revision, metadata["time"][revision]

    def upstream_tag(self, revision):
        return self.upstream_commit(revision)


def vendor(version):
    metadata = json.loads(fetch(f"{REGISTRY_URL}/{version}"))["dist"]
    data = fetch(metadata["tarball"])
    integrity = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()

    if integrity != metadata["integrity"]:
        raise ValueError("Downloaded Squire tarball failed integrity check")

    directory = Path(__file__).parent
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        for path in ("LICENSE", "dist/squire-raw.mjs"):
            source = archive.getmember(f"package/{path}")
            if not source.isfile():
                raise ValueError(f"{source.name} is not a regular file")
            (directory / Path(path).name).write_bytes(archive.extractfile(source).read())


if __name__ == "__main__":
    vendor(sys.argv[1])
