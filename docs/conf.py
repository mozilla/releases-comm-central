# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Configuration file for the Sphinx documentation builder.

import json
import os
import sys

# Set up Python environment to load build system packages.
OUR_DIR = os.path.dirname(__file__)
topsrcdir = os.path.normpath(os.path.join(OUR_DIR, ".."))


project = "Thunderbird Source Docs"
html_show_copyright = False
author = "Thunderbird Developers"

EXTRA_PATHS = ("docs/_addons",)

sys.path[:0] = [os.path.join(topsrcdir, p) for p in EXTRA_PATHS]

sys.path.insert(0, OUR_DIR)

extensions = [
    "myst_parser",
    "sphinx.ext.autodoc",
    "sphinx.ext.autosectionlabel",
    "sphinx.ext.doctest",
    "sphinx.ext.graphviz",
    "sphinx.ext.napoleon",
    "sphinx.ext.todo",
    "sphinx_js",
    "bzlink",
]

js_source_path = "../"
jsdoc_config_path = "jsdoc.conf.json"

# Exclude third-party directories from JSDoc parsing
third_party_paths = []
with open("../tools/lint/ThirdPartyPaths.txt", "r") as file:
    third_party_paths = ["../" + path.removeprefix("comm/").rstrip() for path in file]
with open(jsdoc_config_path, "r+") as file:
    # Extend list of excluded JSDoc paths with third-party paths
    jsdoc_conf = json.load(file)
    jsdoc_conf["source"]["exclude"].extend(third_party_paths)

    # Write excluded paths back to JSDoc config
    file.seek(0)
    json.dump(jsdoc_conf, file)
    file.truncate()

myst_enable_extensions = [
    "deflist",
    "fieldlist",
    "html_admonition",
    "html_image",
    "linkify",
    "replacements",
    "smartquotes",
    "strikethrough",
    "tasklist",
]

myst_linkify_fuzzy_links = False
myst_heading_anchors = 2

templates_path = ["_templates"]
source_suffix = [".rst", ".md"]
exclude_patterns = [
    "_build",
    "Thumbs.db",
    ".DS_Store",
    "_staging",
    "_venv",
    "README.md",
]

html_theme = "sphinx_rtd_theme"
html_static_path = ["_static"]

autosectionlabel_maxdepth = 1


def setup(app):
    app.add_css_file("custom_theme.css")
