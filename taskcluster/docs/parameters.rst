==========
Parameters
==========

Overview
--------

See the gecko_taskgraph parameters documentation.

Comm Push Information
---------------------

These parameters correspond to the repository and revision of the comm-central
repository to checkout. All parameters are required.

``comm_base_repository``
   The repository from which to do an initial clone, utilizing any available
   caching. In practice this is always set to ``https://hg.mozilla.org/comm-unified``.

``comm_base_rev``
  The previous revision before ``comm_head_rev`` got merged into.

``comm_base_ref``
   Reference where ``comm_head_rev`` got merged into. It is usually a branch or a tag.

``comm_head_repository``
   The repository containing the changeset to be built.  This may differ from
   ``comm_base_repository``.

``comm_head_rev``
   The revision to check out; this can be a short revision string.

``comm_head_ref``
   This is the same as ``head_rev``.

``comm_src_path``
   This will effectively always be "comm/". It's used in `comm_taskgraph.files_changed.get_files_changed_extended`
   to handle multiple VCS repositories without hardcoding parameters.
