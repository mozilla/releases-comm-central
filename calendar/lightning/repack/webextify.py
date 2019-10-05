#!/usr/bin/python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

import json
import sys

keys = {
    "extensions.{e2fda1a4-762b-4020-b5ad-a41df1933103}.name": "extensionName",
    "extensions.{e2fda1a4-762b-4020-b5ad-a41df1933103}.description": "extensionDescription",
    "extensions.{e2fda1a4-762b-4020-b5ad-a41df1933103}.creator": "extensionAuthor",
}
data = {}

with open(sys.argv[1], encoding="utf-8") as fp:
    for line in fp.readlines():
        for key, new_key in keys.items():
            if line.startswith(key):
                data[new_key] = {
                    "message": line[line.index("=") + 1:].strip(),
                }

with open(sys.argv[2], "w", encoding="utf-8") as fp:
    json.dump(data, fp, ensure_ascii=False, indent=2, sort_keys=True)
    fp.write("\n")
