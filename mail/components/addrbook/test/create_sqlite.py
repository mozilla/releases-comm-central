# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

import os.path
import sqlite3


def main(output, source):
    output.close()
    with open(os.path.abspath(source), "r") as fp:
        script = fp.read()

    connection = sqlite3.connect(os.path.abspath(output.name))
    connection.executescript(script)
    connection.close()
