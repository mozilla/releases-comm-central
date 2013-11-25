# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

ifndef COMM_BUILD
installer:
	@$(MAKE) -C mail/installer installer

package:
	@$(MAKE) -C mail/installer

package-compare:
	@$(MAKE) -C mail/installer package-compare

stage-package:
	@$(MAKE) -C mail/installer stage-package

install::
	@$(MAKE) -C mail/installer install

source-package::
	@$(MAKE) -C mail/installer source-package

upload::
	@$(MAKE) -C mail/installer upload
ifdef MOZ_CALENDAR
	@$(MAKE) -C calendar/lightning upload
	@$(MAKE) -C calendar/providers/gdata upload
endif

source-upload::
	@$(MAKE) -C mail/installer source-upload

hg-bundle::
	@$(MAKE) -C mail/installer hg-bundle

l10n-check::
	@$(MAKE) -C mail/locales l10n-check

ifdef ENABLE_TESTS
include $(topsrcdir)/../mail/testsuite-targets.mk
endif
endif
