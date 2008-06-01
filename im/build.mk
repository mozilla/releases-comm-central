ifndef LIBXUL_SDK
include $(topsrcdir)/toolkit/toolkit-tiers.mk
endif

TIERS += app

tier_app_dirs += \
  purple \
  instantbird \
  $(NULL)


installer:
	@$(MAKE) -C instantbird/installer installer

package:
	@$(MAKE) -C instantbird/installer

install::
	@$(MAKE) -C instantbird/installer install
