#!/bin/bash

set -ex

TASKCLUSTER_ROOT_URL=https://firefox-ci-tc.services.mozilla.com

dir=$(dirname "$0")
if [ -n "$1" ]; then
    files=( "$@" )
else
    mapfile -t files < <( ls -1 "$dir"/*.yml )
fi
for f in "${files[@]}"; do
    base=$(basename "$f" .yml)
    repo=${base%%-*}
    action=${base#*-}
    # remove people's email addresses
    filter='.owner="user@example.com"'

    case $repo in
        cc)
            repo=comm-central
            ;;
        cb)
            repo=comm-beta
            ;;
        cr)
            repo=comm-release
            ;;
        ce)
            version=$(curl -s https://product-details.mozilla.org/1.0/thunderbird_versions.json | jq -r  .THUNDERBIRD_ESR)
            version=${version%%.*}
            repo=comm-esr${version}
            # unset enable_always_target to fall back to the default, to avoid
            # generating a broken graph with esr115 params
            filter="$filter | del(.enable_always_target)"
            ;;
        try)
            continue
            ;;
        *)
            echo unknown repo "$repo" >&2
            exit 1
            ;;
    esac

    case $action in
        onpush)
            task=comm.v2.${repo}.latest.taskgraph.decision
            service=index
            # find a non-DONTBUILD push
            while :; do
                params=$(curl -f -L "${TASKCLUSTER_ROOT_URL}/api/${service}/v1/task/${task}/artifacts/public%2Fparameters.yml")
                method=$(echo "$params" | yq -r .target_tasks_method)
                if [ "$method" != "nothing" ]; then
                    break
                fi
                pushlog_id=$(echo "$params" | yq -r .pushlog_id)
                task=comm.v2.${repo}.pushlog-id.$((pushlog_id - 1)).decision
            done
            ;;
        cron-*)
            task=${action#cron-}
            task=comm.v2.${repo}.latest.taskgraph.decision-${task}
            service=index
            ;;
        nightly-desktop)
            task=comm.v2.${repo}.latest.taskgraph.decision-nightly-desktop
            service=index
            ;;
        push*|promote*|ship*)
            case $action in
                *-partials)
                    action="${action%-partials}"
                    ;;
                *)
                    filter="$filter | .release_history={}"
                    ;;
            esac
            # shellcheck disable=SC2034
            suffix=
            case $action in
                *-thunderbird)
                    product=thunderbird
                    action=${action%-"$product"}
                    phase=${action}_${product}
                    ;;
                *)
                    echo unknown action "$action" >&2
                    exit 1
                    ;;
            esac
            # grab the action task id from the latest release where this phase wasn't skipped
            task=$(curl -s "https://shipitapi-public.services.mozilla.com/releases?product=${product}&branch=releases/${repo}&status=shipped" | \
                jq -r "map(.phases[] | select(.name == "'"'"$phase"'"'" and (.skipped | not)))[-1].actionTaskId")
            service=queue
            ;;
        *merge-automation)
            # these tasks have no useful indexes; unable to update them automatically
            continue
            ;;
        *)
            echo unknown action "$action" >&2
            exit 1
            ;;
    esac

    curl -f -L "${TASKCLUSTER_ROOT_URL}/api/${service}/v1/task/${task}/artifacts/public%2Fparameters.yml" | yq -y "$filter" > "${f}"
done
