#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

from taskgraph.files_changed import get_changed_files


def is_suite_only_push(repository_url, revision):
    def is_suite(check_path):
        return check_path.startswith("suite/")

    files_changed = get_changed_files(repository_url, revision)

    return all([is_suite(path) for path in files_changed])
