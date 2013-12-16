# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import sys
import re

# Change this number to add an amount to the minor, i.e with MINOR_ADD=2,
# 24.2.0 becomes 2.6.4 instead of 2.6.2
MINOR_ADD=0

def makeversion(x):
  parts = x.split('.')
  major = str((int(parts[0]) + 2))
  parts[0] = major[:-1] + "." + major[-1]
  if len(parts) > 1 and parts[1].isdigit():
    parts[1] = str(int(parts[1]) + MINOR_ADD)
  return re.sub(r'.0([ab][0-9]*|)$', r'\1', '.'.join(parts))

print(makeversion(sys.argv[1]))
