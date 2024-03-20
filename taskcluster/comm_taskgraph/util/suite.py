#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.


def is_suite_only_push(params):
    files_changed = params.get("files_changed")
    comm_prefix = params.get("comm_src_path")
    suite_prefix = f"{comm_prefix}/suite/"

    def is_suite(check_path):
        return check_path.startswith(suite_prefix)

    return all([is_suite(path) for path in files_changed if path.startswith("comm/")])
