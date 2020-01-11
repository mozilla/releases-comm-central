# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

ifeq (cocoa,$(MOZ_WIDGET_TOOLKIT))
# Mac options
APP_NAME = $(MOZ_APP_DISPLAYNAME)
ifdef MOZ_DEBUG
APP_NAME := $(APP_NAME)Debug
endif
BINARY = $(DIST)/$(APP_NAME).app/
ABS_BINARY = $(abspath $(DIST))/$(APP_NAME).app/
else
# Non-mac options
BINARY = $(DIST)/bin/thunderbird$(BIN_SUFFIX)
ABS_BINARY = $(abspath $(BINARY))
endif

check-no-solo = $(foreach solo,SOLO_TEST SOLO_FILE,$(if $($(solo)),$(error $(subst SOLOVAR,$(solo),$(1)))))
find-solo-test = $(if $(and $(SOLO_TEST),$(SOLO_FILE)),$(error Both SOLO_TEST and SOLO_FILE are specified. You may only specify one.),$(if $(SOLO_TEST),$(SOLO_TEST),$(if $(SOLO_FILE),$(SOLO_FILE),$(error SOLO_TEST or SOLO_FILE needs to be specified.))))
