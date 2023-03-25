#!/usr/bin/env python

from setuptools import setup

setup(
    name='fluent.migratetb',
    version='0.11.2',
    description='Toolchain to migrate legacy translation to Fluent. (Thunderbird fork)',
    author='Mozilla',
    author_email='l10n-drivers@mozilla.org',
    license='APL 2',
    url='https://github.com/jfx2006/tb-fluent-migrate/',
    keywords=['fluent', 'localization', 'l10n'],
    classifiers=[
        'Development Status :: 3 - Alpha',
        'Intended Audience :: Developers',
        'License :: OSI Approved :: Apache Software License',
        'Programming Language :: Python :: 3.7',
    ],
    packages=['fluent', 'fluent.migratetb'],
    install_requires=[
        'compare-locales >=8.1, <9.0',
        'fluent.syntax >=0.18.0, <0.19',
        'six',
    ],
    extras_require={
        'hg': ['python-hglib',],
    },
    tests_require=[
        'mock',
    ],
    test_suite='tests.migratetb'
)
