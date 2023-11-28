#!python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import subprocess
import sys

from mozbuild.util import system_encoding

# This script is a wrapper for Botan's configure.py to adapt it for moz.build.
# Its main purpose is to return some output on stdout for mozbuild to handle,
# but secondary to that is to set --enable-modules. Mozbuild/Make mangle
# the list otherwise due to the embedded commas.

botan_modules = ",".join(
    (
        "aead",
        "aes",
        "auto_rng",
        "bigint",
        "blowfish",
        "camellia",
        "cast128",
        "cbc",
        "cfb",
        "crc24",
        "curve25519",
        "des",
        "dl_group",
        "dsa",
        "eax",
        "ec_group",
        "ecdh",
        "ecdsa",
        "ed25519",
        "elgamal",
        "eme_pkcs1",
        "emsa_pkcs1",
        "emsa_raw",
        "ffi",
        "hash",
        "hmac",
        "hmac_drbg",
        "idea",
        "kdf",
        "md5",
        "ocb",
        "pgp_s2k",
        "pubkey",
        "rfc3394",
        "rmd160",
        "rsa",
        "sha1",
        "sha2_32",
        "sha2_64",
        "sha3",
        "sm2",
        "sm3",
        "sm4",
        "sp800_56a",
        "system_rng",
        "twofish",
    )
)

##
here = os.path.abspath(os.path.dirname(__file__))
configure = os.path.join(here, "configure.py")


# A wrapper to obtain a process' output and return code.
# Returns a tuple (retcode, stdout, stderr).
# from build/moz.configure/util.configure
def get_cmd_output(*args, **kwargs):
    proc = subprocess.Popen(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        close_fds=os.name != "nt",
        encoding=system_encoding,
        errors="replace",
    )
    stdout, stderr = proc.communicate()
    return proc.wait(), stdout, stderr


def _run_configure(argv):
    """Call Botan's configure.py. Arguments are passed "shell-style"."""
    args = [sys.executable] + [configure] + list(argv)  # passed as a tuple
    botan_modules_arg = "--enable-modules={}".format(botan_modules)
    args.append(botan_modules_arg)

    try:
        rv = get_cmd_output(*args)
    except Exception:
        raise

    return rv


def main(output, *args):
    rv = _run_configure(args)
    if rv[0] == 0:
        # GENERATED_FILES expects this script to write something back to output
        if os.path.isfile(output.name):
            with open(output.name, "r") as fp:
                data = fp.read()
                output.write(data)
        if os.path.isfile("CMakeLists.txt"):
            os.remove("CMakeLists.txt")
        else:
            # Probably an error
            raise Exception("Unable to locate real output at {}".format(output.name))
    else:
        return rv

    return rv[0]


if __name__ == "__main__":
    main(*sys.argv)
