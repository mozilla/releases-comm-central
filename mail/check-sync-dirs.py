# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# check-sync-dirs.py --- check that one directory is an exact subset of another
#
# Usage: python check-sync-dirs.py COPY ORIGINAL
#
# Check that the files present in the directory tree COPY are exact
# copies of their counterparts in the directory tree ORIGINAL.  COPY
# need not have all the files in ORIGINAL, but COPY may not have files
# absent from ORIGINAL.
#
# Each directory in COPY may have a file named
# 'check-sync-exceptions', which lists files in COPY that need not be
# the same as the corresponding file in ORIGINAL, or exist at all in
# ORIGINAL.  (The 'check-sync-exceptions' file itself is always
# treated as exceptional.)  Blank lines and '#' comments in the file
# are ignored.

import sys
import os
from os.path import join, relpath
import filecmp
import fnmatch
import argparse


from mozlog import commandline


def read_exceptions(filename):
    """
    Return the contents of ``filename``, a 'check-sync-exceptions' file, as a
    set of filenames, along with the basename of ``filename`` itself.  If
    ``filename`` does not exist, return the empty set.
    """
    if (os.path.exists(filename)):
        f = file(filename)
        exceptions = set()
        for line in f:
            line = line.strip()
            if line != '' and line[0] != '#':
                exceptions.add(line)
        exceptions.add(os.path.basename(filename))
        f.close()
        return exceptions
    else:
        return set()


def fnmatch_any(filename, patterns):
    """
    Return ``True`` if ``filename`` matches any pattern in the list of filename
    patterns ``patterns``.
    """
    for pattern in patterns:
        if fnmatch.fnmatch(filename, pattern):
            return True
    return False


def check(logger, copy, original):
    """
    Check the contents of the directory tree ``copy`` against ``original``.  For each
    file that differs, apply REPORT to ``copy``, ``original``, and the file's
    relative path.  ``copy`` and ``original`` should be absolute.  Ignore files
    that match patterns given in files named ``check-sync-exceptions``.
    """
    test_name = "check-sync-dirs.py::{copy}".format(copy=copy)

    def report(relative_name, status='FAIL', message=None):
        logger.test_status(
            test=test_name,
            subtest=relative_name,
            status=status,
            message=message,
        )

    logger.test_start(test=test_name)
    differences_found = False
    for (dirpath, dirnames, filenames) in os.walk(copy):
        exceptions = read_exceptions(join(dirpath, 'check-sync-exceptions'))
        for dirname in dirnames:
            if fnmatch_any(dirname, exceptions):
                dirnames.remove(dirname)
                break
        for filename in filenames:
            copy_name = join(dirpath, filename)
            relative_name = relpath(copy_name, copy)
            original_name = join(original, relative_name)

            if fnmatch_any(filename, exceptions):
                report(relative_name, 'SKIP')
            elif (os.path.exists(original_name)
                  and filecmp.cmp(copy_name, original_name, False)):
                report(relative_name, 'PASS')
            else:
                report(relative_name, 'FAIL',
                       message="differs from: {file}".format(file=join(original, relative_name)),
                       )
                differences_found = True

    logger.test_end(
        test=test_name,
        status='FAIL' if differences_found else 'PASS',
        expected='PASS',
    )
    return differences_found


def get_parser():
    parser = argparse.ArgumentParser()
    parser.add_argument('copy')
    parser.add_argument('original')
    return parser


def main():
    parser = get_parser()
    commandline.add_logging_group(parser)

    args = parser.parse_args()

    logger = commandline.setup_logging("check-sync-dirs", args, {"tbpl": sys.stdout})

    logger.suite_start(tests=[])
    result = check(logger, args.copy, args.original)
    logger.suite_end()
    return result


if __name__ == '__main__':
    sys.exit(main())
