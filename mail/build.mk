# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

ifndef COMM_BUILD
installer:
	@$(MAKE) -C $(COMMDEPTH)/mail/installer installer

package:
	@$(MAKE) -C $(COMMDEPTH)/mail/installer

package-compare:
	@$(MAKE) -C $(COMMDEPTH)/mail/installer package-compare

stage-package:
	@$(MAKE) -C $(COMMDEPTH)/mail/installer stage-package

install::
	@$(MAKE) -C $(COMMDEPTH)/mail/installer install

source-package::
	@$(MAKE) -C $(COMMDEPTH)/mail/installer source-package

upload::
	@$(MAKE) -C $(COMMDEPTH)/mail/installer upload
ifdef MOZ_CALENDAR
	@$(MAKE) -C $(COMMDEPTH)/calendar/lightning upload
	@$(MAKE) -C $(COMMDEPTH)/calendar/providers/gdata upload
endif

source-upload::
	@$(MAKE) -C $(COMMDEPTH)/mail/installer source-upload

hg-bundle::
	@$(MAKE) -C $(COMMDEPTH)/mail/installer hg-bundle

l10n-check::
	@$(MAKE) -C $(COMMDEPTH)/mail/locales l10n-check

wget-en-US:
	$(MAKE) -C $(COMMDEPTH)/mail/locales wget-en-US

# make -j1 because dependencies in l10n build targets don't work
# with parallel builds
merge-% installers-% langpack-% chrome-%:
	$(MAKE) -j1 -C $(COMMDEPTH)/mail/locales $@

ifdef ENABLE_TESTS
include $(commtopsrcdir)/mail/testsuite-targets.mk
endif
endif
