This directory contains an incomplete OpenPGP email integration,
which is based on an initial import of Enigmail Add-on code.

- The code is disabled by default, and can be enabled using
  build time configuration --enable-openpgp

- Care must be taken that any changes to this directory have no
  functional effect on the default behavior of TB.

- Any commits to this directory that accidentally cause the automated
  tests of TB to break may be backed out immediately.

- All commits will be done with DONTBUILD in the commit comment,
  to avoid unnecessary load on the infrastructure.

- For questions or changes, consult:
  Kai Engert, Patrick Brunschwig, Magnus Melin

- Prior to enabling this code, all code must be enabled for
  eslint and must be fully reviewd, as tracked in:
  - https://bugzilla.mozilla.org/show_bug.cgi?id=1595319
  - https://bugzilla.mozilla.org/show_bug.cgi?id=1595325
