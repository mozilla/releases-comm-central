# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import

from setuptools import setup, find_packages

VERSION = "0.1"

setup(
    author="MZLA Technologies",
    author_email="MZLA Technologies Release Engineering",
    name="thirdroc",
    description="Utility for maintaining third party source code in Thunderbird",
    license="MPL 2.0",
    packages=find_packages(),
    version=VERSION,
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Topic :: Software Development :: Build Tools",
        "License :: OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)",
        "Programming Language :: Python :: 3.6",
        "Programming Language :: Python :: Implementation :: CPython",
    ],
)
