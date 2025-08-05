#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -xe

echo "Checking if repo is pinned to an upstream tag..."

# Extract GECKO_HEAD_REF from YAML file
GECKO_HEAD_REF=$(awk -F': ' '/^GECKO_HEAD_REF:/ {print $2}' ../../.gecko_rev.yml | xargs)

if [[ -z "$GECKO_HEAD_REF" || "$GECKO_HEAD_REF" == "default" ]]; then  # If GECKO_HEAD_REF is not set or is set to 'default'
    echo "GECKO_HEAD_REF is not pinned to a tag or a commit hash; was this on purpose?"
    exit 1
elif [[ "$GECKO_HEAD_REF" =~ ^[0-9a-fA-F]{12,40}$ ]]; then  # If GECKO_HEAD_REF is a commit hash (12–40 characters hexadecimal)
    echo "GECKO_HEAD_REF is pinned to a commit hash ($GECKO_HEAD_REF) instead of a tag; was this on purpose?"
    exit 1
elif [[ ! "$GECKO_HEAD_REF" =~ ^FIREFOX_ ]]; then  # If GECKO_HEAD_REF is not a Firefox tag
    echo "GECKO_HEAD_REF appears to be incorrectly pinned to '$GECKO_HEAD_REF'"
    exit 1
fi

echo "GECKO_HEAD_REF is correctly pinned to an upstream tag ($GECKO_HEAD_REF)"
