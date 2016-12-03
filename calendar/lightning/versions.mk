# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Lighting version number
THUNDERBIRD_VERSION := $(shell cat $(topsrcdir)/mail/config/version.txt)
SEAMONKEY_VERSION := $(shell cat $(topsrcdir)/suite/config/version.txt)

ifdef MOZ_SUITE
LIGHTNING_VERSION := $(shell $(PYTHON) $(topsrcdir)/calendar/lightning/build/makeversion.py $(THUNDERBIRD_VERSION))
else
LIGHTNING_VERSION := $(shell $(PYTHON) $(topsrcdir)/calendar/lightning/build/makeversion.py $(word 1,$(MOZ_PKG_VERSION) $(THUNDERBIRD_VERSION)))
endif

GDATA_VERSION := $(shell $(PYTHON) $(topsrcdir)/calendar/providers/gdata/makeversion.py $(LIGHTNING_VERSION))

# For extensions we require a max version that is compatible across security releases.
# THUNDERBIRD_MAXVERSION and SEAMONKEY_MAXVERSION is our method for doing that.
# Alpha versions 10.0a1 and 10.0a2 aren't affected
# For Seamonkey, 2.17 becomes 2.17.*, 2.17.1 becomes 2.17.*
# For Thunderbird, 10.0 becomes 10.*, 10.0.1 becomes 10.*
THUNDERBIRD_MAXVERSION := $(THUNDERBIRD_VERSION)
ifneq (a,$(findstring a,$(THUNDERBIRD_VERSION)))
THUNDERBIRD_MAXVERSION := $(shell echo $(THUNDERBIRD_VERSION) | sed 's|\(^[0-9]*\)\.\([0-9]*\).*|\1|' ).*
endif

SEAMONKEY_MAXVERSION := $(SEAMONKEY_VERSION)
ifneq (a,$(findstring a,$(SEAMONKEY_VERSION)))
SEAMONKEY_MAXVERSION := $(shell echo $(SEAMONKEY_VERSION) | sed 's|\(^[0-9]*.[0-9]*\).*|\1|' ).*
endif
