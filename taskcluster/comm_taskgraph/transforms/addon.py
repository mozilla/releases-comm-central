#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

from mozbuild.chunkify import chunkify
from taskgraph.transforms.base import TransformSequence
from taskgraph.transforms.l10n import parse_locales_file

transforms = TransformSequence()


@transforms.add
def add_l10n_dependencies(config, jobs):
    """
    For multilingual Lightning repackaging, fetches a repackaged build
    artifact for each locale. This is a Linux 64-bit build for all locales
    except ja-JP-mac, in which case it is a OS X build.
    """
    for job in jobs:
        locales_with_changesets = parse_locales_file(job["locales-file"],
                                                     platform="linux64")
        locales_with_changesets = sorted(locales_with_changesets.keys())

        chunks, remainder = divmod(len(locales_with_changesets), job["locales-per-chunk"])
        if remainder:
            chunks = int(chunks + 1)

        for this_chunk in range(1, chunks + 1):
            label = "unsigned-repack-%d" % this_chunk
            job["dependencies"][label] = "nightly-l10n-linux64-shippable-%d/opt" % this_chunk
            chunked_locales = chunkify(locales_with_changesets, this_chunk, chunks)
            job["fetches"][label] = [{
                "artifact": "%s/target.tar.bz2" % locale,
                "dest": locale
            } for locale in chunked_locales]

        mac_locales_with_changesets = parse_locales_file(job["locales-file"],
                                                         platform="macosx64")
        mac_locales_with_changesets = sorted(mac_locales_with_changesets.keys())

        chunks, remainder = divmod(len(mac_locales_with_changesets), job["locales-per-chunk"])
        if remainder:
            chunks = int(chunks + 1)

        for this_chunk in range(1, chunks + 1):
            chunked_locales = chunkify(mac_locales_with_changesets, this_chunk, chunks)
            if "ja-JP-mac" in chunked_locales:
                label = "unsigned-repack-mac"
                job["dependencies"][label] = "nightly-l10n-macosx64-shippable-%d/opt" % this_chunk
                job["fetches"][label] = [{
                    "artifact": "ja-JP-mac/target.dmg",
                    "dest": "ja-JP-mac"
                }]

        del job["locales-file"]
        del job["locales-per-chunk"]

        yield job
