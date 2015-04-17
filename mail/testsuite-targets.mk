# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

MOZMILLDIR=$(DEPTH)/_tests/mozmill
ifeq ($(OS_ARCH),WINNT)
VIRTUALENV_BIN = $(MOZMILLDIR)/../mozmill-virtualenv/Scripts
else
VIRTUALENV_BIN = $(MOZMILLDIR)/../mozmill-virtualenv/bin
endif
MOZMILLPYTHON = $(abspath $(VIRTUALENV_BIN)/python$(BIN_SUFFIX))

ifeq (cocoa,$(MOZ_WIDGET_TOOLKIT))
# Mac options
APP_NAME = $(MOZ_APP_DISPLAYNAME)
ifdef MOZ_DEBUG
APP_NAME := $(APP_NAME)Debug
endif
BINARY = $(DIST)/$(APP_NAME).app/
else
# Non-mac options
BINARY = $(DIST)/bin/thunderbird$(BIN_SUFFIX)
endif

check-no-solo = $(foreach solo,SOLO_TEST SOLO_FILE,$(if $($(solo)),$(error $(subst SOLOVAR,$(solo),$(1)))))
find-solo-test = $(if $(and $(SOLO_TEST),$(SOLO_FILE)),$(error Both SOLO_TEST and SOLO_FILE are specified. You may only specify one.),$(if $(SOLO_TEST),$(SOLO_TEST),$(if $(SOLO_FILE),$(SOLO_FILE),$(error SOLO_TEST or SOLO_FILE needs to be specified.))))

# PYTHONHOME messes very badly with virtualenv setups, so unset it.
mozmill:
	$(call check-no-solo,SOLOVAR is specified. Perhaps you meant mozmill-one.)
	unset PYTHONHOME && cd $(MOZMILLDIR) && MACOSX_DEPLOYMENT_TARGET= \
	$(MOZMILLPYTHON) runtestlist.py --list=mozmilltests.list \
	--binary=$(abspath $(BINARY)) \
	--dir=$(abspath $(topsrcdir))/../mail/test/mozmill \
	--symbols-path=$(abspath $(DIST)/crashreporter-symbols) \
	--plugins-path=$(abspath $(DIST)/plugins) \
	--testing-modules-dir=$(abspath $(DEPTH)/_tests/modules) \
	$(MOZMILL_EXTRA)

mozmill-one: solo-test = $(find-solo-test)
mozmill-one:
	unset PYTHONHOME && cd $(MOZMILLDIR) && MACOSX_DEPLOYMENT_TARGET= \
	$(MOZMILLPYTHON) runtest.py \
	--test=$(abspath $(topsrcdir))/../mail/test/mozmill/$(solo-test) \
	--binary=$(abspath $(BINARY)) \
	--symbols-path=$(abspath $(DIST)/crashreporter-symbols) \
	--plugins-path=$(abspath $(DIST)/plugins) \
	--testing-modules-dir=$(abspath $(DEPTH)/_tests/modules) \
	$(MOZMILL_EXTRA)

# We need to add the mozmill tests to the package for tests.
ifndef UNIVERSAL_BINARY
# If Lightning is enabled, also stage the lightning extension
ifdef MOZ_CALENDAR
package-tests: stage-mozmill stage-calendar
else
package-tests: stage-mozmill
endif
endif

stage-mozmill: make-stage-dir
	$(MAKE) -C $(DEPTH)/mail/test/mozmill stage-package

stage-calendar: make-stage-dir
	$(MAKE) -C $(DEPTH)/calendar/lightning stage-package
	$(MAKE) -C $(DEPTH)/calendar/providers/gdata stage-package

.PHONY: stage-mozmill stage-calendar
