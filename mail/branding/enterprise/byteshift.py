# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Byte shift value applied to AutoConfig files. Must match the default of the
# general.config.obscure_value preference, which the browser subtracts when
# reading the file.
OBSCURE_VALUE = 13


def generate(output, input_path):
    """GENERATED_FILES action: write `input_path` byte shifted by OBSCURE_VALUE.

    `output` is a binary file object provided by the build system.
    """
    with open(input_path, "rb") as fh:
        data = fh.read()
    output.write(bytes((byte + OBSCURE_VALUE) & 0xFF for byte in data))
