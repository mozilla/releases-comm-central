#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse
import os
import sys

from packaging.version import parse

from mozbuild.preprocessor import Preprocessor
from mozbuild.util import FileAvoidWrite, ensureParentDir

from thirdroc.cmake_define_files import define_type, process_cmake_define_file


def rnp_version(version_file, thunderbird_version):
    """
    Update RNP source files: generate version.h
    :param string version_file:
    """
    with open(version_file) as fp:
        version_str = fp.readline(512).strip()

    version = parse(version_str)
    version_major = version.major
    version_minor = version.minor
    version_patch = version.micro

    version_full = f"{version_str}.MZLA.{thunderbird_version}"

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


def rnp_preprocess(tmpl, dest, defines):
    """
    Generic preprocessing
    :param BinaryIO tmpl: open filehandle (read) input
    :param BinaryIO dest: open filehandle (write) output
    :param dict defines: result of get_defines()
    :return boolean:
    """
    pp = Preprocessor()
    pp.setMarker("%")
    pp.addDefines(defines)
    pp.do_filter("substitution")
    pp.out = dest
    pp.do_include(tmpl, True)
    return True


def generate_version_h(output, template, defines):
    """
    Generate version.h for rnp from a the template file, write the
    result to destination.
    :param string template: path to template file (version.h.in)
    :param string destination: path to write generated file (version.h)
    :param dict defines: result of get_defines()
    """
    with open(template) as tmpl:
        rnp_preprocess(tmpl, output, defines)


def main(output, *argv):
    parser = argparse.ArgumentParser(description="Preprocess RNP files.")

    parser.add_argument("version_h_in", help="version.h.in")
    parser.add_argument("config_h_in", help="config.h.in")
    parser.add_argument("-m", type=str, dest="thunderbird_version", help="Thunderbird version")
    parser.add_argument("-V", type=str, dest="version_file", help="Path to RNP version.txt")
    parser.add_argument(
        "-D",
        type=define_type,
        action="append",
        dest="extra_defines",
        default=[],
        help="Additional defines not set at configure time.",
    )

    args = parser.parse_args(argv)

    defines = rnp_version(args.version_file, args.thunderbird_version)

    # "output" is an open filedescriptor for version.h
    generate_version_h(output, args.version_h_in, defines)

    # We must create the remaining output files ourselves. This requires
    # creating the output directory directly if it doesn't already exist.
    ensureParentDir(output.name)
    parent_dir = os.path.dirname(output.name)

    # For config.h, include defines set for version.h and extra -D args
    config_h_defines = dict(args.extra_defines)
    config_h_defines.update(defines)

    with FileAvoidWrite(os.path.join(parent_dir, "config.h")) as fd:
        process_cmake_define_file(fd, args.config_h_in, config_h_defines)


if __name__ == "__main__":
    sys.exit(main(*sys.argv))
