#!/usr/bin/env python

from setuptools import setup

setup(
    name="fluent.migratetb",
    version="0.13.0.1",
    description="Toolchain to migrate legacy translation to Fluent. (Thunderbird fork)",
    author="Mozilla",
    author_email="tb-builds@thunderbird.net",
    license="APL 2",
    url="https://github.com/jfx2006/tb-fluent-migrate/",
    keywords=["fluent", "localization", "l10n"],
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: POSIX",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    packages=["fluent", "fluent.migratetb"],
    install_requires=[
        "compare-locales >=9.0.1, <10.0",
        "fluent.syntax >=0.19.0, <0.20",
    ],
    extras_require={
        "hg": [
            "python-hglib",
        ],
    },
    tests_require=[
        "mock",
    ],
    test_suite="tests.migratetb",
)
