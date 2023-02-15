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

source-package::
	@$(MAKE) -C comm/mail/installer source-package

upload::
	@$(MAKE) -C comm/mail/installer upload

source-upload::
	@$(MAKE) -C comm/mail/installer source-upload

hg-bundle::
	@$(MAKE) -C comm/mail/installer hg-bundle

wget-en-US:
	$(MAKE) -C comm/mail/locales wget-en-US

merge-% post-merge-% installers-% langpack-% chrome-%:
	$(MAKE) -C comm/mail/locales $@

ifdef ENABLE_TESTS
include $(topsrcdir)/comm/mail/testsuite-targets.mk
endif
