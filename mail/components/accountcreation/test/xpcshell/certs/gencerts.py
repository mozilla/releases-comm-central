#!/usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# This script exists to generate the Certificate Authority and server
# certificates used for SSL testing. Adapted from build/pgo/genpgocert.py.

# To use, run `mach python mail/components/accountcreation/test/xpcshell/certs/gencerts.py`.
# This will generate new certificates and database files. These need to be
# checked in with your patch.

import os
import re
import shutil
import subprocess
import sys
from distutils.spawn import find_executable

import mozinfo
from mozfile import NamedTemporaryFile, TemporaryDirectory

from mozbuild.base import BinaryNotFoundException, MozbuildObject

dbFiles = [
    re.compile("^cert[0-9]+\.db$"),
    re.compile("^key[0-9]+\.db$"),
]


def unlinkDbFiles(path):
    for root, dirs, files in os.walk(path):
        for name in files:
            for dbFile in dbFiles:
                if dbFile.match(name) and os.path.exists(os.path.join(root, name)):
                    os.unlink(os.path.join(root, name))


def dbFilesExist(path):
    for root, dirs, files in os.walk(path):
        for name in files:
            for dbFile in dbFiles:
                if dbFile.match(name) and os.path.exists(os.path.join(root, name)):
                    return True
    return False


def runUtil(util, args, inputdata=None, outputstream=None):
    env = os.environ.copy()
    if mozinfo.os == "linux":
        pathvar = "LD_LIBRARY_PATH"
        app_path = os.path.dirname(util)
        if pathvar in env:
            env[pathvar] = "%s%s%s" % (app_path, os.pathsep, env[pathvar])
        else:
            env[pathvar] = app_path
    proc = subprocess.Popen(
        [util] + args,
        env=env,
        stdin=subprocess.PIPE if inputdata else None,
        stdout=outputstream,
        universal_newlines=True,
    )
    proc.communicate(inputdata)
    return proc.returncode


def constructCertDatabase(build, srcDir):
    try:
        certutil = build.get_binary_path(what="certutil")
        pk12util = build.get_binary_path(what="pk12util")
    except BinaryNotFoundException as e:
        print("{}\n\n{}\n".format(e, e.help()))
        return 1
    openssl = find_executable("openssl")
    pycert = os.path.join(build.topsrcdir, "security", "manager", "tools", "pycert.py")
    pykey = os.path.join(build.topsrcdir, "security", "manager", "tools", "pykey.py")

    with NamedTemporaryFile(mode="wt+") as pwfile, TemporaryDirectory() as pemfolder:
        pwfile.write("\n")
        pwfile.flush()

        if dbFilesExist(srcDir):
            # Make sure all DB files from src are really deleted
            unlinkDbFiles(srcDir)

        # Copy  all .certspec and .keyspec files to a temporary directory
        for root, dirs, files in os.walk(srcDir):
            for spec in [i for i in files if i.endswith(".certspec") or i.endswith(".keyspec")]:
                shutil.copyfile(os.path.join(root, spec), os.path.join(pemfolder, spec))

        # Generate certs for all certspecs
        for root, dirs, files in os.walk(pemfolder):
            for certspec in [i for i in files if i.endswith(".certspec")]:
                name = certspec.split(".certspec")[0]
                pem = os.path.join(pemfolder, "{}.cert.pem".format(name))

                print("Generating public certificate {} (pem={})".format(name, pem))

                with open(os.path.join(root, certspec), "r") as certspec_file:
                    certspec_data = certspec_file.read()
                    with open(pem, "w") as pem_file:
                        status = runUtil(
                            pycert, [], inputdata=certspec_data, outputstream=pem_file
                        )
                        if status:
                            return status

                status = runUtil(
                    certutil,
                    [
                        "-A",
                        "-n",
                        name,
                        "-t",
                        "P,,",
                        "-i",
                        pem,
                        "-d",
                        srcDir,
                        "-f",
                        pwfile.name,
                    ],
                )
                if status:
                    return status

                shutil.copyfile(pem, os.path.join(srcDir, name))

            for keyspec in [i for i in files if i.endswith(".keyspec")]:
                parts = keyspec.split(".")
                name = parts[0]
                key_type = parts[1]
                if key_type not in ["ca", "client", "server"]:
                    raise Exception(
                        "{}: keyspec filenames must be of the form XXX.client.keyspec "
                        "or XXX.ca.keyspec (key_type={})".format(keyspec, key_type)
                    )
                key_pem = os.path.join(pemfolder, "{}.key.pem".format(name))

                print("Generating private key {} (pem={})".format(name, key_pem))

                with open(os.path.join(root, keyspec), "r") as keyspec_file:
                    keyspec_data = keyspec_file.read()
                    with open(key_pem, "w") as pem_file:
                        status = runUtil(pykey, [], inputdata=keyspec_data, outputstream=pem_file)
                        if status:
                            return status

                cert_pem = os.path.join(pemfolder, "{}.cert.pem".format(name))
                if not os.path.exists(cert_pem):
                    raise Exception(
                        "There has to be a corresponding certificate named {} for "
                        "the keyspec {}".format(cert_pem, keyspec)
                    )

                p12 = os.path.join(pemfolder, "{}.key.p12".format(name))
                print("Converting private key {} to PKCS12 (p12={})".format(key_pem, p12))
                status = runUtil(
                    openssl,
                    [
                        "pkcs12",
                        "-export",
                        "-inkey",
                        key_pem,
                        "-in",
                        cert_pem,
                        "-name",
                        name,
                        "-out",
                        p12,
                        "-passout",
                        "file:" + pwfile.name,
                    ],
                )
                if status:
                    return status

                print("Importing private key {} to database".format(key_pem))
                status = runUtil(
                    pk12util,
                    ["-i", p12, "-d", srcDir, "-w", pwfile.name, "-k", pwfile.name],
                )
                if status:
                    return status

                shutil.copyfile(cert_pem, os.path.join(srcDir, "{}.ca".format(name)))

        for root, dirs, files in os.walk(srcDir):
            for ca in [i for i in files if i.endswith(".ca")]:
                print("Importing certificate authority {} to database".format(ca))
                name = ca.split(".ca")[0]
                status = runUtil(
                    certutil,
                    [
                        "-A",
                        "-n",
                        name,
                        "-t",
                        "CT,,",
                        "-i",
                        os.path.join(srcDir, ca),
                        "-d",
                        srcDir,
                        "-f",
                        pwfile.name,
                    ],
                )
                if status:
                    return status
    return 0


build = MozbuildObject.from_environment()
certdir = os.path.join(
    build.topsrcdir,
    "comm",
    "mail",
    "components",
    "accountcreation",
    "test",
    "xpcshell",
    "certs",
)
certificateStatus = constructCertDatabase(build, certdir)
if certificateStatus:
    print("TEST-UNEXPECTED-FAIL | SSL Server Certificate generation")
sys.exit(certificateStatus)
