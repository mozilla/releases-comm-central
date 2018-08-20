# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

package:
	@$(MAKE) -C comm/suite/installer

package-compare:
	@$(MAKE) -C comm/suite/installer package-compare

install::
	@$(MAKE) -C comm/suite/installer install

source-package::
	@$(MAKE) -C comm/suite/installer source-package

upload::
	@$(MAKE) -C comm/suite/installer upload

source-upload::
	@$(MAKE) -C comm/suite/installer source-upload

# make -j1 because dependencies in l10n build targets don't work
# with parallel builds
merge-% installers-% langpack-% chrome-% clobber-%:
	$(MAKE) -j1 -C comm/suite/locales $@

# mochitests need to be run from the Mozilla build system
ifdef ENABLE_TESTS
# Backend is implemented in mozilla/testing/testsuite-targets.mk.
# This part is copied from mozilla/browser/build.mk.

mochitest-browser-chrome:
	$(RUN_MOCHITEST) --browser-chrome
	$(CHECK_TEST_ERROR)

mochitest:: mochitest-browser-chrome

.PHONY: mochitest-browser-chrome
endif
