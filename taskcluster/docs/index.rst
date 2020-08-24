.. taskcluster_index:

TaskCluster Task-Graph Generation
=================================

The ``comm/taskcluster`` directory contains support for defining the graph of tasks
that must be executed to build and test Thunderbird.

As Thunderbird is built on top of Firefox's source, the
`Firefox Taskgraph documentation <https://firefox-source-docs.mozilla.org/taskcluster/index.html>`_
is an invaluable resource.

The documentation here describes Thunderbird specifics.

.. toctree::

    kinds
    loading
    transforms
    cron

