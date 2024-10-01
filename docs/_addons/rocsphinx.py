# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from docutils import nodes
from sphinx.util.docutils import ReferenceRole


class Searchfox(ReferenceRole):
    """Role which links a relative path from the source to it's searchfox URL.

    Can be used like:

        See :searchfox:`browser/base/content/browser-places.js` for more details.

    Will generate a link to
    ``https://searchfox.org/mozilla-central/source/browser/base/content/browser-places.js``

    The example above will use the path as the text, to use custom text:

        See :searchfox:`this file <browser/base/content/browser-places.js>` for
        more details.

    To specify a different source tree:

        See :searchfox:`mozilla-beta:browser/base/content/browser-places.js`
        for more details.
    """

    def run(self):
        base = "https://searchfox.org/{source}/source/{path}"

        if ":" in self.target:
            source, path = self.target.split(":", 1)
        else:
            source = "comm-central"
            path = self.target

        if path.startswith("comm/"):
            path = path[5:]

        url = base.format(source=source, path=path)

        if self.has_explicit_title:
            title = self.title
        else:
            title = path

        node = nodes.reference(self.rawtext, title, refuri=url, **self.options)
        return [node], []


def setup(app):
    from rocbuild.roctreedocs import manager

    app.add_role("searchfox", Searchfox())

    # Unlike typical Sphinx installs, our documentation is assembled from
    # many sources and staged in a common location. This arguably isn't a best
    # practice, but it was the easiest to implement at the time.
    #
    # Here, we invoke our custom code for staging/generating all our
    # documentation.
    manager.generate_docs(app)
    app.srcdir = manager.staging_dir
