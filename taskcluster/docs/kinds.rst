Task Kinds
==========

This section lists and documents the additional task kinds that are specific
to Thunderbird and are implemented in it's source tree.

balrog
------
Submits update information to Balrog for shippable builds after artifacts have
been promoted.

beetmover-checksums
-------------------
Publishes checksum files for promoted artifacts to the public release location
via Beetmover.

beetmover-repackage
-------------------
Publishes repackaged (and localized) installer artifacts and related files via
Beetmover for promoted builds.

beetmover-source
----------------
Publishes signed source archives via Beetmover for releases.

beetmover-strings-source
------------------------
Publishes strings source files via Beetmover to FTP.

bouncer-locations
-----------------
Updates Bouncer product locations (download endpoints) for Thunderbird
nightlies and releases during the shipping phase.

build
-----
Builds Thunderbird and generate relevant artifacts (installers, packages, test
archives, etc.).

build-mac-notarization
----------------------
Notarizes macOS build artifacts after they have been signed.

build-mac-signing
-----------------
Signs macOS build artifacts (PKG/DMG/TAR).

build-signing
-------------
Signs platform build artifacts for shippable builds (e.g. Windows installers).

code-review
-----------
Automation to support code review workflows (e.g. Phabricator/Lando hooks).

docker-image
------------
Builds Docker images used as worker environments by other kinds.

fetch
-----
Fetches and cache external resources (e.g. toolchains, source archives) that
are consumed by other tasks.

l10n
----
Schedules localization tasks and produce locale metadata consumed by downstream
l10n repackaging and update tasks.

l10n-bump
---------
Bumps Thunderbird localization changesets.

l10n-pre
--------
Prepares strings tarball used by shippable localization jobs.

mar-signing
-----------
Sign complete MAR (update) packages for promoted builds.

mar-signing-l10n
----------------
Sign localized MAR (update) packages for promoted builds.

merge-automation
----------------
Hook-driven tasks that automate "Merge Day" tasks (e.g. version bumps, branch
merges across comm-* branches, etc.).

packages
--------
Builds packages for use in docker images.

partials
--------
Takes the complete.mar files produced in previous tasks and generates
partial updates between previous nightly releases and the new one. Requires a
release_history in the parameters. See `mach release-history` if doing this
manually.

partials-signing
----------------
Signs partial update MARs produced by `partials`.

pin-verify
----------
Verifies that `gecko_rev.yml` is pinned to a Firefox tag on releases.

post-balrog-dummy
-----------------
Dummy task used after Balrog submissions to avoid `max_dependencies` limits.

post-beetmover-checksums-dummy
------------------------------
Dummy task used after Beetmover checksum publication to avoid
`max_dependencies` limits.

post-beetmover-dummy
--------------------
Dummy task used after Beetmover publication to avoid `max_dependencies`
limits.

release-balrog-scheduling
-------------------------
Schedules a Release for shipping in Balrog. If a `release_eta` was provided when
starting the Release, it will be scheduled to go live at that day and time.

release-balrog-submit-toplevel
------------------------------
Top-level Balrog submission wrapper used by the release promotion graph.

release-beetmover-push-to-release
---------------------------------
Moves artifacts from the candidates area to the releases directory on the CDN
via Beetmover.

release-beetmover-source-checksums
----------------------------------
Publishes checksums for source archives as part of release promotion.

release-bouncer-aliases
-----------------------
Updates Bouncer's (download.mozilla.org) "latest" aliases.

release-bouncer-check
---------------------
Validates that Bouncer products and locations are consistent for a release.

release-bouncer-sub
-------------------
Submits Bouncer product and location definitions required for a release.

release-early-tagging
---------------------
Creates early tags and related version markers used by the release process.

release-final-verify
--------------------
Verifies the contents and package of release update MARs.

release-flatpak-push
--------------------
Pushes Thunderbird Flatpak artifacts to Flathub.

release-flatpak-repackage
-------------------------
Repackages Thunderbird as both Flatpak bundle and Flatpak repo artifacts.

release-generate-checksums
--------------------------
Generates checksums for release artifacts.

release-generate-checksums-beetmover
------------------------------------
Publishes generated checksum files via Beetmover as part of release promotion.

release-generate-checksums-signing
----------------------------------
Signs checksum files generated for a release.

release-mark-as-shipped
-----------------------
Marks a release as shipped in Ship-It.

release-msix-push
-----------------
Pushes MSIX artifacts to the Microsoft Store.

release-notes-verify
--------------------
Verifies that the release notes for a given release have been published.

release-notify-av-announce
--------------------------
Notifies anti-virus vendors that a new Thunderbird release is available for
scanning.

release-notify-promote
----------------------
Sends “promote” phase notifications for a release.

release-notify-push
-------------------
Sends “push” phase notifications for a release.

release-notify-ship
-------------------
Sends “ship” phase notifications for a release.

release-notify-started
----------------------
Sends “started” notifications when a release promotion begins.

release-push-langpacks
----------------------
Publishes language packs (XPIs) to addons.thunderbird.net.

release-snap-repackage
----------------------
Repackages Thunderbird as Snap for testing purposes.

release-source
--------------
Creates source archives (tarballs) for a release.

release-source-checksums-signing
--------------------------------
Signs checksum files for source archives created during a release.

release-source-signing
----------------------
Signs source archives created during a release.

release-update-product-channel-version
-------------------------------------
Updates product, channel, and version metadata in Ship-It.

release-update-verify
---------------------
Verifies the contents and package of release update MARs.

release-update-verify-config
----------------------------
Creates configuration files used by `release-update-verify`.

release-update-verify-config-next
---------------------------------
Creates configuration files used by `release-update-verify-next`.

release-update-verify-next
--------------------------
Verifies the contents and package of release and updare MARs from the previous
ESR release.

release-version-bump
--------------------
Bumps version number and related metadata changes during the release process.

repackage
---------
Repackages build outputs into platform-specific installer formats (e.g. DMG,
MSI, tarballs).

repackage-deb
-------------
Repackages Thunderbird as a Debian package (.deb).

repackage-deb-l10n
------------------
Creates localized Debian packages (.deb) from `repackage-deb` .deb artifact.

repackage-l10n
--------------
Repackages localized builds for all locales using `l10n` artifacts.

repackage-msi
-------------
Repackages Thunderbird as a Windows MSI package.

repackage-msix
--------------
Repackages Thunderbird as a Windows MSIX package.

repackage-shippable-l10n-msix
-----------------------------
Creates localized Windows MSIX packages.

repackage-signing
-----------------
Signs repackaged (Windows) artifacts.

repackage-signing-l10n
----------------------
Signs localized repackaged (Windows) artifacts.

repackage-signing-msi
---------------------
Signs repackaged MSI artifacts.

repackage-signing-msix
----------------------
Signs repackaged MSIX artifacts.

repackage-signing-shippable-l10n-msix
-------------------------------------
Signs localized repackaged MSIX artifacts for shippable localized builds.

repo-update
-----------
Tasks that perform some action on the project repo itself in order to update its
state in some way.

searchfox
---------
Generates C++ index data for Searchfox.

shippable-l10n
--------------
Repacks a shippable build from the nightly l10n task, in order to provide
localized versions of the same source.

shippable-l10n-mac-notarization
-------------------------------
Mac notarization on signingscript (linux) using rcodesign.

Only available in production environments, as Apple doesn't offer a test
endpoint for notarizing apps.

Downstream tasks should use build-mac-signing in non-shippable builds or level 1
environments.

shippable-l10n-mac-signing
--------------------------
Signs localized macOS artifacts without notarization (using a self-signed
certificate on level 1 environments).

Shippable downstream tasks should use artifacts from build-mac-notarization.

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
Signs artifacts from `shippable-l10n-pre`.

shippable-l10n-signing
----------------------
Takes artifacts from the shippable-l10n kind and passes them to signing servers
to have their contents signed appropriately, based on an appropriate signing
format. One signing job is created for each shippable-l10n job (usually
chunked).

source-docs
-----------
Triggers a build of the in-tree source documentation at
source-docs.thunderbird.net.

source-test
-----------
Runs source-level tests and analysis that do not require a full build. This can
include linting, unit tests, source-code analysis, or measurement work. While
source-test tasks run from a source checkout, it is still possible for them to
depend on a build artifact, though often they do not.

test
----
Runs Thunderbird test suites against build artifacts (e.g. xpcshell, mochitests,
etc.).

toolchain
---------
Builds toolchain artifacts (e.g. compilers, linkers, SDK pieces) used by the
CI graph.

upload-symbols
--------------
Uploads debug symbols to the symbol server for crash analysis.

upload-symbols-dummy
--------------------
Ensures macosx64 tasks run for nightlies and releases.
