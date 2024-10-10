# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this,
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os


def walk_path(folder_path, prefix):
    file_list = []
    for root, dirs, files in os.walk(folder_path, followlinks=True):
        for file_name in files:
            if os.path.splitext(file_name)[1] == ".ftl":
                file_name = os.path.relpath(os.path.join(root, file_name), folder_path)
                file_name = os.path.join(prefix, file_name)
                file_list.append(file_name)
    file_list.sort()

    return file_list


def get_source_ftls(comm_src_dir):
    """Find ftl files in en-US mail and calendar."""
    file_list = []
    for d in ["mail", "calendar"]:
        folder_path = os.path.join(comm_src_dir, d, "locales/en-US")
        file_list += walk_path(folder_path, d)
    return file_list


def get_lang_ftls(l10n_path):
    """Find ftl files in the merge directory."""
    file_list = []
    for d in ["mail", "calendar"]:
        folder_path = os.path.join(l10n_path, d)
        file_list += walk_path(folder_path, d)
    return file_list


def add_missing_ftls(l10n_path, source_files, locale_files):
    """
    For any ftl files that are in source_files but missing in locale_files,
    create a placeholder file.
    """
    for file_name in source_files:
        if file_name not in locale_files:
            full_file_name = os.path.join(l10n_path, file_name)
            file_path = os.path.dirname(full_file_name)
            if not os.path.isdir(file_path):
                # Create missing folder
                print("Creating missing folder: {}".format(os.path.relpath(file_path, l10n_path)))
                os.makedirs(file_path)

            print("Adding missing file: {}".format(file_name))
            with open(full_file_name, "w") as f:
                f.write(
                    "# This Source Code Form is subject to the terms of the Mozilla Public\n"
                    "# License, v. 2.0. If a copy of the MPL was not distributed with this\n"
                    "# file, You can obtain one at http://mozilla.org/MPL/2.0/.\n"
                )
