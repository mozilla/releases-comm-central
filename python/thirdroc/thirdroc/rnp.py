# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import

import os
from io import StringIO
from datetime import date
import re
from distutils.version import StrictVersion

from mozbuild.preprocessor import Preprocessor


def rnp_source_update(rnp_root, version_str, revision, timestamp, bug_report):
    """
    Update RNP source files: generate version.h and mangle config.h.in
    :param rnp_root:
    :type rnp_root:
    :param string version_str: latest version
    :param string revision: revision hash (short form)
    :param float timestamp: UNIX timestamp from revision
    :param string bug_report: where to report bugs for this RNP build
    """
    version = StrictVersion(version_str)
    version_major = version.version[0]
    version_minor = version.version[1]
    version_patch = version.version[2]
    date_str = date.fromtimestamp(float(timestamp)).strftime("%Y%m%d")
    revision_short = revision[:8]
    version_full = "{}+git{}.{}.MZLA".format(version_str, date_str, revision_short)

    defines = dict(
        RNP_VERSION_MAJOR=version_major,
        RNP_VERSION_MINOR=version_minor,
        RNP_VERSION_PATCH=version_patch,
        RNP_VERSION=version_str,
        RNP_VERSION_FULL=version_full,
        RNP_VERSION_COMMIT_TIMESTAMP=str(timestamp),
        BUGREPORT_EMAIL=bug_report,
    )
    src_lib = os.path.join(rnp_root, "src", "lib")
    version_h_in = os.path.join(src_lib, "version.h.in")
    version_h = os.path.join(src_lib, "version.h")
    config_h_in = os.path.join(src_lib, "config.h.in")
    readme_rnp = os.path.join(rnp_root, "..", "README.rnp")

    generate_version_h(version_h_in, version_h, defines)
    mangle_config_h_in(config_h_in, defines)
    update_readme(readme_rnp, revision)


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


def generate_version_h(template, destination, defines):
    """
    Generate version.h for rnp from a the template file, write the
    result to destination.
    :param string template: path to template file (version.h.in)
    :param string destination: path to write generated file (version.h)
    :param dict defines: result of get_defines()
    """
    with open(template) as tmpl:
        with open(destination, "w") as dest:
            rnp_preprocess(tmpl, dest, defines)


def mangle_config_h_in(template, defines):
    """
    Mangle RNP's config.h.in so that it will work with CONFIGURE_DEFINE_FILES
    :param string template: path to config.h.in
    :param dict defines: result of get_defines()
    """
    with open(template) as tmpl:
        tmp_string = StringIO()
        rnp_preprocess(tmpl, tmp_string, defines)

    tmp_string.seek(0)

    with open(template, "w") as dest:
        for line in tmp_string:
            if line.startswith("#cmakedefine"):
                line = line.replace("#cmakedefine", "#undef")
            dest.write(line)
        dest.write("\n")


def update_readme(path, revision):
    """
    Updates the commit hash in README.rnp
    :param string path: Path to README.rnp
    :param string revision: revision to insert
    """
    commit_re = re.compile(r"^\[commit [\da-f]{40}\]$")
    with open(path) as orig:
        tmp_string = StringIO()
        tmp_string.write(orig.read())

    tmp_string.seek(0)

    with open(path, "w") as dest:
        for line in tmp_string:
            if commit_re.match(line):
                line = "[commit {}]\n".format(revision)
            dest.write(line)
