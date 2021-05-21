==========
Parameters
==========

Overview
--------

See the Firefox taskgraph parameters documentation.

Comm Push Information
---------------------

These parameters correspond to the repository and revision of the comm-central
repository to checkout. All parameters are required.

``comm_base_repository``
   The repository from which to do an initial clone, utilizing any available
   caching. In practice this is always set to ``https://hg.mozilla.org/comm-central``.

``comm_head_repository``
   The repository containing the changeset to be built.  This may differ from
   ``comm_base_repository``.

``comm_head_rev``
   The revision to check out; this can be a short revision string.

``comm_head_ref``
   This is the same as ``head_rev``.
