# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Note that this file is "included" from $topsrcdir/Makefile.in, therefore
# paths are relative to $topobjdir not the location of this file.

package:
	@$(MAKE) -C comm/mail/installer

package-compare:
	@$(MAKE) -C comm/mail/installer package-compare

stage-package:
	@$(MAKE) -C comm/mail/installer stage-package

install::
	@$(MAKE) -C comm/mail/installer install

upload::
	@$(MAKE) -C comm/mail/installer upload

hg-bundle::
	@$(MAKE) -C comm/mail/installer hg-bundle

wget-en-US:
	$(MAKE) -C comm/mail/locales wget-en-US

# TODO there might be a dependency on the stamp here for the
# non-MOZ_USE_MAKEFILE_INSTALLER_BUILD path.

installers-%: $(INSTALLER_REPACK_DEPS)
	$(MAKE) -C comm/mail/locales $@

merge-% langpack-% chrome-%:
	$(MAKE) -C comm/mail/locales $@

ifdef ENABLE_TESTS
include $(topsrcdir)/comm/mail/testsuite-targets.mk
endif
