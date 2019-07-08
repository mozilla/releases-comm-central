#!/bin/bash

CURDIR=$(dirname $0)/
TESTDIR=$CURDIR/..
CLIENT=$CURDIR/client/client
KEYFILE=$CURDIR/client/otr.key

MAX_MSG=250
MAX_INTERVAL=10 # msec

source $TESTDIR/utils/tap/tap.sh

diag "Messaging with random interval of max $MAX_INTERVAL and number of message to $MAX_MSG"
$CLIENT --load-key $KEYFILE --timeout $MAX_INTERVAL --max-msg $MAX_MSG
