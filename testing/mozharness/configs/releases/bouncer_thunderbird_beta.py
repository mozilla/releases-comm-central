# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# lint_ignore=E501
config = {
    "products": {
        "installer": {
            "product-name": "Thunderbird-%(version)s",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "installer-latest": {
            "product-name": "Thunderbird-beta-latest",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "installer-ssl": {
            "product-name": "Thunderbird-%(version)s-SSL",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "installer-latest-ssl": {
            "product-name": "Thunderbird-beta-latest-SSL",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "msi": {
            "product-name": "Thunderbird-%(version)s-msi-SSL",
            "platforms": [
                "win",
                "win64",
            ],
        },
        "msi-latest": {
            "product-name": "Thunderbird-beta-msi-latest-SSL",
            "platforms": [
                "win",
                "win64",
            ],
        },
        "msix": {
            "product-name": "Thunderbird-%(version)s-msix-SSL",
            "platforms": [
                "win",
                "win64",
            ],
        },
        "msix-latest": {
            "product-name": "Thunderbird-beta-msix-latest-SSL",
            "platforms": [
                "win",
                "win64",
            ],
        },
        "complete-mar": {
            "product-name": "Thunderbird-%(version)s-Complete",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
    },
    "partials": {
        "releases-dir": {
            "product-name": "Thunderbird-%(version)s-Partial-%(prev_version)s",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
    },
}
