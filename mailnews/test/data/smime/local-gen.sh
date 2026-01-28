#!/bin/bash

set -e

# This script creates additional S/MIME test files.
# It's called automatically by generate.sh.
# However, it can also be called directly, if the test data from NSS
# is still sufficiently fresh, and only the local test files need to
# be updated, e.g. when adding new tests.

if [ -n "$NSS_LIB_PATH" ]
then
  export LD_LIBRARY_PATH=${NSS_LIB_PATH}:$LD_LIBRARY_PATH
  export SHLIB_PATH=${NSS_LIB_PATH}:$SHLIB_PATH
  export LIBPATH=${NSS_LIB_PATH}:$LIBPATH
  export DYLD_LIBRARY_PATH=${NSS_LIB_PATH}:$DYLD_LIBRARY_PATH
fi

if ! test -e generate.sh || ! test -e local-gen.sh
then
  echo "you must run this script from inside the directory that contains local-gen.sh and generate.sh"
  exit
fi

if ! hash certutil || ! hash pk12util || ! hash atob || ! hash btoa
then
  echo "Required NSS utilities cannot be executed. Add \$OBJDIR/dist/bin of a local Thunderbird build to both the PATH and (platform specific) library path environment variable (e.g. LD_LIBRARY_PATH or DYLD_LIBRARY_PATH)."
  exit
fi

MILLDIR="$(pwd)/../../../../mail/test/browser/smime/data"

# When executing mochitests in the CI environment, the files from this
# directory aren't available. Copy all files that mochitests requires to
# the mochitests directory.
cp -rv Alice.p12 Bob.p12 TestCA.pem "$MILLDIR"
cp -rv alice.dsig.SHA256.multipart.env.eml "$MILLDIR"
cp -rv alice.sig.SHA256.opaque.env.eml "$MILLDIR"
cp -rv alice.env.eml "$MILLDIR"

TMPDIR="./tmp-local"
mkdir $TMPDIR

BOUNDARY="--------BOUNDARY"

EMAILDATE=$(date --rfc-email --utc)

MSGHEADER="MIME-Version: 1.0
Date: ${EMAILDATE}
From: Alice <alice@example.com>
To: Bob <bob@example.com>
Subject: a message
Content-Type: multipart/alternative; boundary=\"${BOUNDARY}\"

"

ENVHEADER="Content-Type: application/pkcs7-mime; smime-type=enveloped-data
Content-Transfer-Encoding: base64

"

certutil -d $TMPDIR -N --empty-password
pk12util -d $TMPDIR -i Alice.p12 -W nss
pk12util -d $TMPDIR -i Bob.p12 -W nss
certutil -d $TMPDIR -M -n TestCA -t C,C,

INPUT="Content-type: text/plain

SECRET-TEXT the attacker wants to steal
"
echo "$INPUT" | cmsutil -d $TMPDIR -E -r bob@example.com | btoa > $TMPDIR/prey.b64

INPUT="Content-type: text/html

<pre>Please reply to this harmless looking message</pre><style>.moz-text-plain, .moz-quote-pre, fieldset {display: none;}</style>"
echo "$INPUT" | cmsutil -d $TMPDIR -E -r bob@example.com | btoa > $TMPDIR/bait.b64

MSG=$TMPDIR/msg.eml

{
  echo -n "$MSGHEADER"
  echo "--$BOUNDARY"
  echo -n "$ENVHEADER"
  cat $TMPDIR/bait.b64
  echo "--$BOUNDARY"
  echo -n "$ENVHEADER"
  cat $TMPDIR/prey.b64
  echo "--$BOUNDARY"
} > $MSG

mv $MSG "$MILLDIR/multipart-alternative.eml"

# Create a message with a mismatching message date (use a later time,
# because the test certificates aren't valid at earlier times).

GOOD_DATE=$(grep ^Date "alice.dsig.SHA256.multipart.eml" | sed 's/^Date: //')
FUTURE_DATE=$(date --utc --rfc-email --date="${GOOD_DATE} + 6 hours")
sed "s/^Date: .*$/Date: ${FUTURE_DATE}/" "alice.dsig.SHA256.multipart.eml" > "alice.future.dsig.SHA256.multipart.eml"

rm -rf $TMPDIR
