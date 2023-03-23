#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -xe

# duplicate the functionality of taskcluster-lib-urls, but in bash..
queue_base="$TASKCLUSTER_PROXY_URL/api/queue/v1"

# Get RTD secret location from task definition
if [ -n "${TASK_ID}" ]; then
  curl --location --retry 10 --retry-delay 10 -o /builds/worker/task.json "$queue_base/task/$TASK_ID"
  RTD_SECRET=$(jq -r '.scopes[] | select(contains ("rtd-webhook"))' /builds/worker/task.json | awk -F: '{print $3}')
fi

# Get the secret value from the secrets service
if [ -n "${RTD_SECRET}" ] && getent hosts taskcluster; then
  set +x # Don't echo these
  secrets_url="${TASKCLUSTER_PROXY_URL}/api/secrets/v1/secret/${RTD_SECRET}"
  SECRET=$(curl "${secrets_url}")
  TOKEN=$(echo "${SECRET}" | jq -r '.secret.token')
elif [ -n "${RTD_TOKEN}" ]; then # Allow for local testing.
  TOKEN="${RTD_TOKEN}"
fi

if [ -n "${TOKEN}" ]; then
  curl \
    -X POST \
    -d "branches=latest" \
    -d "token=${TOKEN}" \
    https://readthedocs.com/api/v2/webhook/thunderbird-thunderbird-source-docs/9778/
fi

