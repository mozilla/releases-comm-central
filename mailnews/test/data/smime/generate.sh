#!/bin/bash

mkdir nssbuild
cd nssbuild

cp -riv ../../../../../../security/nss nss
cp -riv ../../../../../../nsprpub nspr

export USE_64=1
cd nss
make nss_build_all

export NSS_CYCLES=sharedb
export NSS_TESTS=smime
cd tests
HOST=localhost DOMSUF=localdomain ./all.sh

cd ../../..
cp -v nssbuild/tests_results/security/localhost.1/sharedb/smime/tb/*.eml .
cp -v nssbuild/tests_results/security/localhost.1/sharedb/smime/tb/*.p12 .
cp -v nssbuild/tests_results/security/localhost.1/sharedb/smime/tb/*.pem .

EXPIRATION_INFO_FILE="`pwd`/expiration.txt"
ALICE_DIR="`pwd`/nssbuild/tests_results/security/localhost.1/sharedb/alicedir"

pushd nssbuild/nss/tests/common
OBJ=`make objdir_name`
popd

pushd nssbuild/dist/${OBJ}/bin
./certutil -d ${ALICE_DIR} -L -n Alice |grep -i "Not After" | \
  sed 's/^.*: //' > ${EXPIRATION_INFO_FILE}
popd

echo "Done. Will remove the NSS build/test tree in 20 seconds."
sleep 20
rm -rf nssbuild
