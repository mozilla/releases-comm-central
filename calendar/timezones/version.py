#!/usr/bin/python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
import json, os.path

json_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "zones.json")

with open(json_file, "r") as fp:
    data = json.load(fp)
    print data["version"]
