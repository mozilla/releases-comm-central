#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import sys

import buildconfig

sourcestamp_tmpl = """{buildid}
{comm_repo}/rev/{comm_rev}
{gecko_repo}/rev/{gecko_rev}
"""


def mk_hg_url(repo, revision):
    """
    Return a URL to a specific revision in the given repo.
    """
    return "{}/rev/{}".format(repo, revision)


def gen_platformini(output, platform_ini):
    gecko_repo = buildconfig.substs.get("MOZ_GECKO_SOURCE_REPO", "")
    gecko_rev = buildconfig.substs.get("MOZ_GECKO_SOURCE_CHANGESET", "")

    with open(platform_ini, "r") as fp:
        data = fp.readlines()

    for i in range(len(data)):
        if data[i].startswith("SourceRepository="):
            data[i] = "SourceRepository=%s\n" % gecko_repo
        elif data[i].startswith("SourceStamp="):
            data[i] = "SourceStamp=%s\n" % gecko_rev

    with open(platform_ini, "w") as fp:
        fp.writelines(data)

    output.write("platform.ini updated.\n")


def gen_sourcestamp(output):
    data = dict(
        buildid=os.environ.get("MOZ_BUILD_DATE", "unknown"),
        gecko_repo=buildconfig.substs.get("MOZ_GECKO_SOURCE_REPO", None),
        gecko_rev=buildconfig.substs.get("MOZ_GECKO_SOURCE_CHANGESET", None),
        comm_repo=buildconfig.substs.get("MOZ_COMM_SOURCE_REPO", None),
        comm_rev=buildconfig.substs.get("MOZ_COMM_SOURCE_CHANGESET", None),
    )

    output.write(sourcestamp_tmpl.format(**data))


def source_repo_header(output):
    """
    Appends the Gecko source repository information to source-repo.h
    This information should be set in buildconfig.substs by moz.configure
    """
    gecko_repo = buildconfig.substs.get("MOZ_GECKO_SOURCE_REPO", None)
    gecko_rev = buildconfig.substs.get("MOZ_GECKO_SOURCE_CHANGESET", None)
    comm_repo = buildconfig.substs.get("MOZ_COMM_SOURCE_REPO", None)
    comm_rev = buildconfig.substs.get("MOZ_COMM_SOURCE_CHANGESET", None)

    if None in [gecko_repo, gecko_rev, comm_repo, comm_rev]:
        Exception(
            "Source information not found in buildconfig."
            "Try setting GECKO_HEAD_REPOSITORY and GECKO_HEAD_REV"
            "as well as MOZ_SOURCE_REPO and MOZ_SOURCE_CHANGESET"
            "environment variables and running mach configure again."
        )

    output.write("#define MOZ_GECKO_SOURCE_STAMP {}\n".format(gecko_rev))
    output.write("#define MOZ_COMM_SOURCE_STAMP {}\n".format(comm_rev))
    output.write("#define MOZ_SOURCE_STAMP {}\n".format(comm_rev))

    if buildconfig.substs.get("MOZ_INCLUDE_SOURCE_INFO"):
        gecko_source_url = mk_hg_url(gecko_repo, gecko_rev)
        comm_source_url = mk_hg_url(comm_repo, comm_rev)
        output.write("#define MOZ_GECKO_SOURCE_REPO {}\n".format(gecko_repo))
        output.write("#define MOZ_GECKO_SOURCE_URL {}\n".format(gecko_source_url))
        output.write("#define MOZ_COMM_SOURCE_REPO {}\n".format(comm_repo))
        output.write("#define MOZ_COMM_SOURCE_URL {}\n".format(comm_source_url))
        output.write("#define MOZ_SOURCE_REPO {}\n".format(comm_repo))
        output.write("#define MOZ_SOURCE_URL {}\n".format(comm_source_url))


def main(args):
    if args:
        func = globals().get(args[0])
        if func:
            return func(sys.stdout, *args[1:])

    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
