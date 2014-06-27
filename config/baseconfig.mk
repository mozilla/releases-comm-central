# This file is normally included by autoconf.mk, but it is also used
# directly in python/mozbuild/mozbuild/base.py for gmake validation.
# We thus use INCLUDED_AUTOCONF_MK to enable/disable some parts depending
# whether a normal build is happening or whether the check is running.
includedir := $(includedir)/$(MOZ_APP_NAME)-$(MOZ_APP_VERSION)
idldir = $(datadir)/idl/$(MOZ_APP_NAME)-$(MOZ_APP_VERSION)
installdir = $(libdir)/$(MOZ_APP_NAME)-$(MOZ_APP_VERSION)
sdkdir = $(libdir)/$(MOZ_APP_NAME)-devel-$(MOZ_APP_VERSION)
MOZILLA_SRCDIR = $(topsrcdir)/mozilla
MOZDEPTH = $(DEPTH)/mozilla
DIST = $(MOZDEPTH)/dist

# We do magic with OBJ_SUFFIX in config.mk, the following ensures we don't
# manually use it before config.mk inclusion
_OBJ_SUFFIX := $(OBJ_SUFFIX)
OBJ_SUFFIX = $(error config/config.mk needs to be included before using OBJ_SUFFIX)

ifeq ($(HOST_OS_ARCH),WINNT)
# We only support building with a non-msys gnu make version
# strictly above 4.0.
ifdef .PYMAKE
$(error Pymake is no longer supported. Please upgrade to MozillaBuild 1.9 or newer and build with 'mach' or 'mozmake')
endif

ifeq (,$(filter mozmake%,$(notdir $(MAKE))))
$(error Only building with pymake or mozmake is supported.)
endif

ifdef INCLUDED_AUTOCONF_MK
ifeq (a,$(firstword a$(subst /, ,$(srcdir))))
$(error MSYS-style srcdir are not supported for Windows builds.)
endif
endif
endif # WINNT

ifndef INCLUDED_AUTOCONF_MK
default::
endif
