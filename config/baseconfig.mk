# This file is normally included by autoconf.mk, but it is also used
# directly in python/mozbuild/mozbuild/base.py for gmake validation.
# We thus use INCLUDED_AUTOCONF_MK to enable/disable some parts depending
# whether a normal build is happening or whether the check is running.

MOZILLA_SRCDIR = $(topsrcdir)/mozilla
ifndef INCLUDED_AUTOCONF_MK
default::
else
include $(MOZILLA_SRCDIR)/config/baseconfig.mk
endif

# WIN_TOP_SRC is converted by config.mk to mozilla-central, but this needs to be comm-central.
ifdef WIN_TOP_SRC
WIN_TOP_SRC := $(patsubst %/mozilla,%,$(WIN_TOP_SRC))
endif
