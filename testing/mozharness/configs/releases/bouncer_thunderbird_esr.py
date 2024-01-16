# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# lint_ignore=E501
config = {
    "products": {
        "installer": {
            "product-name": "Thunderbird-%(version)s",
            "platforms": [
                "linux",
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "installer-latest": {
            "product-name": "Thunderbird-esr-latest",
            "platforms": [
                "linux",
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "installer-next-latest": {
            "product-name": "Thunderbird-esr-next-latest",
            "platforms": [
                "linux",
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "installer-ssl": {
            "product-name": "Thunderbird-%(version)s-SSL",
            "platforms": [
                "linux",
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "installer-latest-ssl": {
            "product-name": "Thunderbird-esr-latest-SSL",
            "platforms": [
                "linux",
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "installer-next-latest-ssl": {
            "product-name": "Thunderbird-esr-next-latest-SSL",
            "platforms": [
                "linux",
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
            "product-name": "Thunderbird-esr-msi-latest-SSL",
            "platforms": [
                "win",
                "win64",
            ],
        },
        "msi-next-latest": {
            "product-name": "Thunderbird-esr-next-msi-latest-SSL",
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
            "product-name": "Thunderbird-esr-msix-latest-SSL",
            "platforms": [
                "win",
                "win64",
            ],
        },
        "msix-next-latest": {
            "product-name": "Thunderbird-esr-next-msix-latest-SSL",
            "platforms": [
                "win",
                "win64",
            ],
        },
        "pkg": {
            "product-name": "Thunderbird-%(version)s-pkg-SSL",
            "platforms": ["osx"],
        },
        "pkg-latest": {
            "product-name": "Thunderbird-esr-pkg-latest-SSL",
            "platforms": ["osx"],
        },
        "pkg-next-latest": {
            "product-name": "Thunderbird-esr-next-pkg-latest-SSL",
            "platforms": ["osx"],
        },
        "langpack": {
            "product-name": "Thunderbird-%(version)s-langpack-SSL",
            "platforms": [
                "linux",
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "langpack-latest": {
            "product-name": "Thunderbird-esr-langpack-latest-SSL",
            "platforms": [
                "linux",
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "langpack-latest-next": {
            "product-name": "Thunderbird-esr-next-langpack-latest-SSL",
            "platforms": [
                "linux",
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "complete-mar": {
            "product-name": "Thunderbird-%(version)s-Complete",
            "platforms": [
                "linux",
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
                "linux",
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
    },
}
