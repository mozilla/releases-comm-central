# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

ifndef COMM_BUILD
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

l10n-check::
	@$(MAKE) -C $(commtopobjdir)/mail/locales l10n-check

wget-en-US:
	$(MAKE) -C $(commtopobjdir)/mail/locales wget-en-US

# make -j1 because dependencies in l10n build targets don't work
# with parallel builds
merge-% installers-% langpack-% chrome-%:
	$(MAKE) -j1 -C $(commtopobjdir)/mail/locales $@

ifdef ENABLE_TESTS
include $(commtopsrcdir)/mail/testsuite-targets.mk
endif
endif
