#!/usr/bin/python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

import json

with open("manifest.json", encoding="utf-8") as fp:
    data = json.load(fp)

data["name"] = "__MSG_extensionName__"
data["description"] = "__MSG_extensionDescription__"
data["author"] = "__MSG_extensionAuthor__"
data["default_locale"] = "en-US"

with open("manifest.json", "w", encoding="utf-8") as fp:
    json.dump(data, fp, ensure_ascii=False, indent=2, sort_keys=True)
    fp.write("\n")
