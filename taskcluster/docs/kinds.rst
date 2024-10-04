Task Kinds
==========

This section lists and documents the additional task kinds that are specific
to Thunderbird and are implemented in it's source tree.

beetmover-strings-source
------------------------

Upload strings source files to FTP.


shippable-l10n-pre
------------------
Prepares a build artifact containing the translated strings from all locales.
The artifact is consumed by `shippable-l10n` to produce the localized
Thunderbird builds.

Using
.....

- kind-dependencies:
    Must include `build`
- transforms:
    Must include `comm_taskgraph.transforms.l10n_pre:transforms`
- only-for-attributes:
    Must include `shippable`
- only-for-build-platforms:
    This is set to `linux64-shippable/opt` so that it only runs for that
    platform. All platforms will consume the build artifact from
    `linux64-shippable/opt`. (It's just string data; nothing platform-specific
    in there.)

Parameters
..........

There are some task parameters specific to this task kind.

- locale-list:
  Points to either `shipped-locales` or `all-locales`. This file is used to
  select the locales that are included in the build artifact.
- comm-locales-file:
  This file contains the revision of the `comm-l10n` monorepo to checkout.
- browser-locales-file:
  This file contains the revisions of the `l10n-central` repositories to checkout.
  This is for toolkit and other strings used from mozilla-central.

Other notes
...........

The mozharness script reads its configuration from `thunderbird_split_l10n.py`.
In that file, `hg_l10n_base` refers to the `l10n-central` repository root.
This is used with `browser-locales-file` to get the strings from toolkit and
devtools that are needed.

Also in the mozharness config file is `hg_comm_l10n_repo`, set to the URL of
the `comm-l10n` monorepo.

The mozharness script will clone the necessary repositories from `l10n-central`,
and `comm-l10n`, merge them, and create a tar file.


shippable-l10n-pre-signing
--------------------------

Signing task for shippable-l10n-pre artifacts


source-docs
-----------

Build Thunderbird source documentation and upload to RTD.


upload-symbols-dummy
--------------------

Upload-symbols-dummy ensures both x64 and macosx64 tasks run for nightlies and releases.
