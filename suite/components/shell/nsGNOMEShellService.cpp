/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "mozilla/ArrayUtils.h"

#include "nsCOMPtr.h"
#include "nsGNOMEShellService.h"
#include "nsShellService.h"
#include "nsIServiceManager.h"
#include "nsIFile.h"
#include "nsIProperties.h"
#include "nsDirectoryServiceDefs.h"
#include "nsIPrefService.h"
#include "prenv.h"
#include "nsString.h"
#include "nsIGIOService.h"
#include "nsIGSettingsService.h"
#include "nsIStringBundle.h"
#include "nsIOutputStream.h"
#include "nsIProcess.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsIImageLoadingContent.h"
#include "imgIRequest.h"
#include "imgIContainer.h"
#include "mozilla/GRefPtr.h"
#include "mozilla/Sprintf.h"
#include "mozilla/dom/Element.h"
#if defined(MOZ_WIDGET_GTK)
#include "nsImageToPixbuf.h"
#endif
#include "nsXULAppAPI.h"
#include "gfxPlatform.h"

#include <glib.h>
#include <glib-object.h>
#include <gtk/gtk.h>
#include <gdk/gdk.h>
#include <gdk-pixbuf/gdk-pixbuf.h>
#include <limits.h>
#include <stdlib.h>

using namespace mozilla;

struct ProtocolAssociation {
  uint16_t app;
  const char* protocol;
  bool essential;
};

struct MimeTypeAssociation {
  uint16_t app;
  const char* mimeType;
  const char* extensions;
};

static const ProtocolAssociation gProtocols[] = {
  { nsIShellService::BROWSER, "http", true },
  { nsIShellService::BROWSER, "https", true },
  { nsIShellService::BROWSER, "ftp", false },
  { nsIShellService::BROWSER, "chrome", false },
  { nsIShellService::MAIL, "mailto", true },
  { nsIShellService::NEWS, "news", true },
  { nsIShellService::NEWS, "snews", true },
  { nsIShellService::RSS, "feed", true }
};

static const MimeTypeAssociation gMimeTypes[] = {
  { nsIShellService::BROWSER, "text/html", "htm html shtml" },
  { nsIShellService::BROWSER, "application/xhtml+xml", "xhtml xht" },
  { nsIShellService::MAIL, "message/rfc822", "eml" },
  { nsIShellService::RSS, "application/rss+xml", "rss" }
};

#define kDesktopBGSchema "org.gnome.desktop.background"
#define kDesktopImageGSKey "picture-uri"
#define kDesktopOptionGSKey "picture-options"
#define kDesktopDrawBGGSKey "draw-background"
#define kDesktopColorGSKey "primary-color"

NS_IMPL_ISUPPORTS(nsGNOMEShellService, nsIGNOMEShellService, nsIShellService)

nsresult
GetBrandName(nsACString& aBrandName)
{
  // get the product brand name from localized strings
  nsresult rv;
  nsCOMPtr<nsIStringBundleService> bundleService(do_GetService("@mozilla.org/intl/stringbundle;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIStringBundle> brandBundle;
  rv = bundleService->CreateBundle(BRAND_PROPERTIES, getter_AddRefs(brandBundle));
  NS_ENSURE_TRUE(brandBundle, rv);

  nsAutoString brandName;
  rv = brandBundle->GetStringFromName("brandShortName", brandName);
  NS_ENSURE_SUCCESS(rv, rv);

  CopyUTF16toUTF8(brandName, aBrandName);
  return rv;
}

nsresult
nsGNOMEShellService::Init()
{
  nsresult rv;

  if (gfxPlatform::IsHeadless()) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  // Check G_BROKEN_FILENAMES.  If it's set, then filenames in glib use
  // the locale encoding.  If it's not set, they use UTF-8.
  mUseLocaleFilenames = PR_GetEnv("G_BROKEN_FILENAMES") != nullptr;

 if (GetAppPathFromLauncher()) return NS_OK;

  nsCOMPtr<nsIFile> appPath;
  rv = NS_GetSpecialDirectory(XRE_EXECUTABLE_FILE, getter_AddRefs(appPath));
  NS_ENSURE_SUCCESS(rv, rv);

  return appPath->GetNativePath(mAppPath);
}

bool nsGNOMEShellService::GetAppPathFromLauncher() {
  gchar *tmp;

  const char* launcher = PR_GetEnv("MOZ_APP_LAUNCHER");
  if (!launcher) return false;

  if (g_path_is_absolute(launcher)) {
    mAppPath = launcher;
    tmp = g_path_get_basename(launcher);
    gchar* fullpath = g_find_program_in_path(tmp);
    if (fullpath && mAppPath.Equals(fullpath)) mAppIsInPath = true;
    g_free(fullpath);
  } else {
    tmp = g_find_program_in_path(launcher);
    if (!tmp) return false;
    mAppPath = tmp;
    mAppIsInPath = true;
  }

  g_free(tmp);
  return true;
}

bool
nsGNOMEShellService::CheckHandlerMatchesAppName(const nsACString &handler) const
{
  gint argc;
  gchar** argv;
  nsAutoCString command(handler);

  // The string will be something of the form: [/path/to/]application "%s"
  // We want to remove all of the parameters and get just the binary name.

  if (g_shell_parse_argv(command.get(), &argc, &argv, nullptr) && argc > 0) {
    command.Assign(argv[0]);
    g_strfreev(argv);
  }

  gchar *commandPath;
  if (mUseLocaleFilenames) {
    gchar *nativePath =
        g_filename_from_utf8(command.get(), -1, nullptr, nullptr, nullptr);
    if (!nativePath) {
      NS_ERROR("Error converting path to filesystem encoding");
      return false;
    }

    commandPath = g_find_program_in_path(nativePath);
    g_free(nativePath);
  } else {
    commandPath = g_find_program_in_path(command.get());
  }

  if (!commandPath) return false;

  bool matches = mAppPath.Equals(commandPath);
  g_free(commandPath);
  return matches;
}

NS_IMETHODIMP
nsGNOMEShellService::IsDefaultClient(bool aStartupCheck, uint16_t aApps,
                                     bool* aIsDefaultClient)
{
  *aIsDefaultClient = false;

  nsCOMPtr<nsIGIOService> giovfs = do_GetService(NS_GIOSERVICE_CONTRACTID);
  nsAutoCString handler;
  nsCOMPtr<nsIGIOMimeApp> gioApp;

  for (unsigned int i = 0; i < std::size(gProtocols); i++) {
    if (aApps & gProtocols[i].app) {
      if (!gProtocols[i].essential) continue;

      if (giovfs) {
        handler.Truncate();
        nsCOMPtr<nsIHandlerApp> handlerApp;
        nsDependentCString protocol(gProtocols[i].protocol);
        giovfs->GetAppForURIScheme(protocol, getter_AddRefs(handlerApp));
        gioApp = do_QueryInterface(handlerApp);
        if (!gioApp)
          return NS_OK;

        if (NS_SUCCEEDED(gioApp->GetCommand(handler)) &&
            !CheckHandlerMatchesAppName(handler))
         return NS_OK;
      }
    }
  }

  *aIsDefaultClient = true;

  return NS_OK;
}

NS_IMETHODIMP
nsGNOMEShellService::SetDefaultClient(bool aForAllUsers,
                                      bool aClaimAllTypes, uint16_t aApps)
{
  nsCOMPtr<nsIGIOService> giovfs = do_GetService(NS_GIOSERVICE_CONTRACTID);
  if (giovfs) {
    nsresult rv;
    nsCString brandName;
    rv = GetBrandName(brandName);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIGIOMimeApp> appInfo;
    rv = giovfs->FindAppFromCommand(mAppPath, getter_AddRefs(appInfo));
    if (NS_FAILED(rv)) {
      // Application was not found in the list of installed applications
      // provided by OS. Fallback to create appInfo from command and name.
      rv = giovfs->CreateAppFromCommand(mAppPath, brandName,
                                        getter_AddRefs(appInfo));
      NS_ENSURE_SUCCESS(rv, rv);
    }

    // set handler for the protocols
    for (unsigned int i = 0; i < std::size(gProtocols); ++i) {
      if (aApps & gProtocols[i].app) {
        if (appInfo && (gProtocols[i].essential || aClaimAllTypes)) {
          nsDependentCString protocol(gProtocols[i].protocol);
          appInfo->SetAsDefaultForURIScheme(protocol);
        }
      }
    }

    if (aClaimAllTypes) {
      for (unsigned int i = 0; i < std::size(gMimeTypes); i++) {
        if (aApps & gMimeTypes[i].app) {
          nsDependentCString type(gMimeTypes[i].mimeType);
          appInfo->SetAsDefaultForMimeType(type);
          nsDependentCString extensions(gMimeTypes[i].extensions);
          appInfo->SetAsDefaultForFileExtensions(extensions);
        }
      }
    }
  }

  return NS_OK;
}

NS_IMETHODIMP
nsGNOMEShellService::GetCanSetDesktopBackground(bool* aResult)
{
  // for Gnome or desktops using the same GSettings keys
  const char *currentDesktop = getenv("XDG_CURRENT_DESKTOP");
  if (currentDesktop && strstr(currentDesktop, "GNOME") != nullptr) {
    *aResult = true;
    return NS_OK;
  }

  const char *gnomeSession = getenv("GNOME_DESKTOP_SESSION_ID");
  if (gnomeSession) {
    *aResult = true;
  } else {
    *aResult = false;
  }

  return NS_OK;
}

static nsresult WriteImage(const nsCString &aPath, imgIContainer *aImage) {
#if !defined(MOZ_WIDGET_GTK)
  return NS_ERROR_NOT_AVAILABLE;
#else
  RefPtr<GdkPixbuf> pixbuf = nsImageToPixbuf::ImageToPixbuf(aImage);
  if (!pixbuf) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  gboolean res = gdk_pixbuf_save(pixbuf, aPath.get(), "png", nullptr, nullptr);
  return res ? NS_OK : NS_ERROR_FAILURE;
#endif
}

NS_IMETHODIMP
nsGNOMEShellService::SetDesktopBackground(dom::Element* aElement,
                                          int32_t aPosition,
                                          const nsACString& aImageName)
{
  nsresult rv;
  nsCOMPtr<nsIImageLoadingContent> imageContent =
      do_QueryInterface(aElement, &rv);
  if (!imageContent) return rv;

  // Get the image container.
  nsCOMPtr<imgIRequest> request;
  rv = imageContent->GetRequest(nsIImageLoadingContent::CURRENT_REQUEST,
                                getter_AddRefs(request));
  if (!request) return rv;
  nsCOMPtr<imgIContainer> container;
  rv = request->GetImage(getter_AddRefs(container));
  if (!container) return rv;

  // Set desktop wallpaper filling style.
  nsAutoCString options;
  switch (aPosition) {
    case BACKGROUND_TILE:
      options.AssignLiteral("wallpaper");
      break;
    case BACKGROUND_STRETCH:
      options.AssignLiteral("stretched");
      break;
    case BACKGROUND_FILL:
      options.AssignLiteral("zoom");
      break;
    case BACKGROUND_FIT:
      options.AssignLiteral("scaled");
      break;
    default:
      options.AssignLiteral("centered");
      break;
  }

  // Write the background file to the home directory.
  nsCString filePath(PR_GetEnv("HOME"));

  nsCString brandName;
  rv = GetBrandName(brandName);
  NS_ENSURE_SUCCESS(rv, rv);

  // Build the file name.
  filePath.Append('/');
  filePath.Append(brandName);
  filePath.AppendLiteral("_wallpaper.png");

  // Write the image to a file in the home dir.
  rv = WriteImage(filePath, container);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIGSettingsService> gsettings =
      do_GetService(NS_GSETTINGSSERVICE_CONTRACTID);
  if (gsettings) {
    nsCOMPtr<nsIGSettingsCollection> background_settings;
    gsettings->GetCollectionForSchema(nsLiteralCString(kDesktopBGSchema),
                                      getter_AddRefs(background_settings));
    if (background_settings) {
      gchar *file_uri = g_filename_to_uri(filePath.get(), nullptr, nullptr);
      if (!file_uri) return NS_ERROR_FAILURE;

      background_settings->SetString(nsLiteralCString(kDesktopOptionGSKey),
                                     options);
      background_settings->SetString(nsLiteralCString(kDesktopImageGSKey),
                                     nsDependentCString(file_uri));
      g_free(file_uri);
      background_settings->SetBoolean(nsLiteralCString(kDesktopDrawBGGSKey),
                                      true);
      return rv;
    }
  }

  return NS_ERROR_FAILURE;
}

#define COLOR_16_TO_8_BIT(_c) ((_c) >> 8)
#define COLOR_8_TO_16_BIT(_c) ((_c) << 8 | (_c))

NS_IMETHODIMP
nsGNOMEShellService::GetDesktopBackgroundColor(uint32_t *aColor)
{
  nsCOMPtr<nsIGSettingsService> gsettings =
      do_GetService(NS_GSETTINGSSERVICE_CONTRACTID);
  nsCOMPtr<nsIGSettingsCollection> background_settings;
  nsAutoCString background;

  if (gsettings) {
    gsettings->GetCollectionForSchema(nsLiteralCString(kDesktopBGSchema),
                                      getter_AddRefs(background_settings));
    if (background_settings) {
      background_settings->GetString(nsLiteralCString(kDesktopColorGSKey),
                                     background);
    }
  }

  if (background.IsEmpty()) {
    *aColor = 0;
    return NS_OK;
  }

  GdkColor color;
  NS_ENSURE_TRUE(gdk_color_parse(background.get(), &color), NS_ERROR_FAILURE);

  *aColor = COLOR_16_TO_8_BIT(color.red) << 16 |
            COLOR_16_TO_8_BIT(color.green) << 8 |
            COLOR_16_TO_8_BIT(color.blue);
  return NS_OK;
}

NS_IMETHODIMP
nsGNOMEShellService::SetDesktopBackgroundColor(uint32_t aColor)
{
  NS_ENSURE_ARG_MAX(aColor, 0xFFFFFF);

  uint16_t red = COLOR_8_TO_16_BIT((aColor >> 16) & 0xff);
  uint16_t green = COLOR_8_TO_16_BIT((aColor >> 8) & 0xff);
  uint16_t blue = COLOR_8_TO_16_BIT(aColor & 0xff);
  char colorString[14];
  sprintf(colorString, "#%04x%04x%04x", red, green, blue);

  nsCOMPtr<nsIGSettingsService> gsettings =
      do_GetService(NS_GSETTINGSSERVICE_CONTRACTID);
  if (gsettings) {
    nsCOMPtr<nsIGSettingsCollection> background_settings;
    gsettings->GetCollectionForSchema(nsLiteralCString(kDesktopBGSchema),
                                      getter_AddRefs(background_settings));
    if (background_settings) {
      background_settings->SetString(nsLiteralCString(kDesktopColorGSKey),
                                     nsDependentCString(colorString));
      return NS_OK;
    }
  }

  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP
nsGNOMEShellService::OpenApplicationWithURI(nsIFile* aApplication, const nsACString& aURI)
{
  nsresult rv;
  nsCOMPtr<nsIProcess> process =
    do_CreateInstance("@mozilla.org/process/util;1", &rv);
  if (NS_FAILED(rv))
    return rv;

  rv = process->Init(aApplication);
  if (NS_FAILED(rv))
    return rv;

  const nsCString& spec = PromiseFlatCString(aURI);
  const char* specStr = spec.get();
  return process->Run(false, &specStr, 1);
}

NS_IMETHODIMP
nsGNOMEShellService::GetDefaultFeedReader(nsIFile** _retval)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}
