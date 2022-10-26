# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

package:
	@$(MAKE) -C $(commtopobjdir)/mail/installer

package-compare:
	@$(MAKE) -C $(commtopobjdir)/mail/installer package-compare

stage-package:
	@$(MAKE) -C $(commtopobjdir)/mail/installer stage-package

install::
	@$(MAKE) -C $(commtopobjdir)/mail/installer install

source-package::
	@$(MAKE) -C $(commtopobjdir)/mail/installer source-package

upload::
	@$(MAKE) -C $(commtopobjdir)/mail/installer upload

source-upload::
	@$(MAKE) -C $(commtopobjdir)/mail/installer source-upload

hg-bundle::
	@$(MAKE) -C $(commtopobjdir)/mail/installer hg-bundle

wget-en-US:
	$(MAKE) -C $(commtopobjdir)/mail/locales wget-en-US

merge-% post-merge-% installers-% langpack-% chrome-%:
	$(MAKE) -C $(commtopobjdir)/mail/locales $@

ifdef ENABLE_TESTS
include $(commtopsrcdir)/mail/testsuite-targets.mk
endif
