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
cp -rv alice.sig.SHA256.opaque.eml "$MILLDIR"
cp -rv alice.sig.SHA256.opaque.env.eml "$MILLDIR"
cp -rv alice.html.sig.SHA256.opaque.eml "$MILLDIR"
cp -rv alice.html.sig.SHA256.opaque.env.eml "$MILLDIR"
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

# Wrap the clear-signed message in a multipart/mixed part and append an
# unsigned footer, like mailing list software does. The signed part is
# copied unmodified, its signature remains valid.
# The signed part is at MIME part number 1.1, unless an unsigned header
# part is added in front of it, then it is at 1.2.
# $1: output file, $2: if "header", add an unsigned part before the
# signed part.

MIXED_BOUNDARY="============MIXEDBOUNDARY=="
MIXED_DATE=$(printf '%s' "${GOOD_DATE}" | tr -d '\r')
MIXED_SIGNED_CT=$(grep -i '^Content-Type: multipart/signed' "alice.dsig.SHA256.multipart.eml" | tr -d '\r')

wrap_signed_in_mixed() {
  {
    printf 'MIME-Version: 1.0\r\n'
    printf 'Date: %s\r\n' "${MIXED_DATE}"
    printf 'From: Alice@example.com\r\n'
    printf 'To: test-list@example.com\r\n'
    printf 'Subject: [test-list] clear-signed sig.SHA256 wrapped in multipart/mixed\r\n'
    printf 'Content-Type: multipart/mixed; boundary="%s"\r\n' "${MIXED_BOUNDARY}"
    printf '\r\n'
    if [ "$2" = "header" ]
    then
      printf -- '--%s\r\n' "${MIXED_BOUNDARY}"
      printf 'Content-Type: text/plain; charset="us-ascii"\r\n'
      printf 'Content-Transfer-Encoding: 7bit\r\n'
      printf 'Content-Description: Mailing list header\r\n'
      printf '\r\n'
      printf 'Welcome to the test-list mailing list.\r\n'
      printf '\r\n'
    fi
    printf -- '--%s\r\n' "${MIXED_BOUNDARY}"
    printf '%s\r\n' "${MIXED_SIGNED_CT}"
    printf '\r\n'
    # Everything after the header block, that is the complete signed part.
    sed '1,/^\r*$/d' "alice.dsig.SHA256.multipart.eml"
    printf -- '--%s\r\n' "${MIXED_BOUNDARY}"
    printf 'Content-Type: text/plain; charset="us-ascii"\r\n'
    printf 'Content-Transfer-Encoding: 7bit\r\n'
    printf 'Content-Description: Mailing list footer\r\n'
    printf '\r\n'
    printf 'test-list mailing list -- test-list@example.com\r\n'
    printf '\r\n'
    printf -- '--%s--\r\n' "${MIXED_BOUNDARY}"
  } > "$1"
}

wrap_signed_in_mixed "$MILLDIR/alice.dsig.SHA256.multipart.in.mixed.eml"
wrap_signed_in_mixed "$MILLDIR/alice.dsig.SHA256.multipart.in.mixed.with.header.eml" header

rm -rf $TMPDIR
