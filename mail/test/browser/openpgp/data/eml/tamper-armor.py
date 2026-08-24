#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Corrupt an ASCII-armored OpenPGP message so its MDC integrity check fails.

Flips one byte deep in the OpenPGP packet data and re-armors WITHOUT a CRC ("=")
line (the CRC is optional per RFC 9580), so the change lands in the ciphertext
rather than in the armor checksum. Reads armored input from a file argument (or
stdin) and writes the tampered armor (CRLF line endings) to stdout.

Only used when regenerating the remote-content test corpus; see
generate-remote-content-eml.txt.

Usage:
    python3 tamper-armor.py mdc.asc > mdc-tampered.asc
"""

import base64
import sys


def tamper(armored):
    lines = armored.replace("\r\n", "\n").split("\n")
    i = next(
        k for k, l in enumerate(lines) if l.startswith("-----BEGIN PGP MESSAGE-----")
    ) + 1
    while lines[i].strip():  # skip armor headers up to the blank separator
        i += 1
    i += 1
    body = []
    while not (lines[i].startswith("=") or lines[i].startswith("-----END")):
        body.append(lines[i].strip())
        i += 1
    raw = bytearray(base64.b64decode("".join(body)))
    raw[int(len(raw) * 0.66)] ^= 0xFF
    b64 = base64.b64encode(bytes(raw)).decode()
    wrapped = "\r\n".join(b64[j : j + 64] for j in range(0, len(b64), 64))
    return (
        "-----BEGIN PGP MESSAGE-----\r\n\r\n"
        f"{wrapped}\r\n"
        "-----END PGP MESSAGE-----\r\n"
    )


def main():
    data = open(sys.argv[1]).read() if len(sys.argv) > 1 else sys.stdin.read()
    sys.stdout.write(tamper(data))


if __name__ == "__main__":
    sys.exit(main())
