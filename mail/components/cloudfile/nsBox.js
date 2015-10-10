/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This file implements the nsIMsgCloudFileProvider interface.
 *
 * This component handles the Box implementation of the
 * nsIMsgCloudFileProvider interface.
 */

var {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/gloda/log4moz.js");
Cu.import("resource:///modules/cloudFileAccounts.js");
Cu.import("resource:///modules/OAuth2.jsm");
Cu.import("resource://gre/modules/Http.jsm");

var gServerUrl = "https://api.box.com/2.0/";
var gUploadUrl = "https://upload.box.com/api/2.0/";

var kAuthBaseUrl = "https://www.box.com/api/";
var kAuthUrl = "oauth2/authorize";

XPCOMUtils.defineLazyServiceGetter(this, "gProtocolService",
                                   "@mozilla.org/uriloader/external-protocol-service;1",
                                   "nsIExternalProtocolService");

function nsBox() {
  this.log = Log4Moz.getConfiguredLogger("BoxService");
  this._oauth = new OAuth2(kAuthBaseUrl, null, kClientId, kClientSecret);
  this._oauth.authURI = kAuthBaseUrl + kAuthUrl;

  let account = this;
  Object.defineProperty(this._oauth, "refreshToken", {
    get: function getRefreshToken() {
      if (!this.mRefreshToken) {
        let authToken = cloudFileAccounts.getSecretValue(account.accountKey,
                                                         cloudFileAccounts.kTokenRealm);
        this.mRefreshToken = authToken || "";
      }
      return this.mRefreshToken;
    },
    set: function setRefreshToken(aVal) {
      if (!aVal)
        aVal = "";

      cloudFileAccounts.setSecretValue(account.accountKey,
                                       cloudFileAccounts.kTokenRealm,
                                       aVal);

      return (this.mRefreshToken = aVal);
    },
    enumerable: true
  });
}

nsBox.prototype = {
  /* nsISupports */
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMsgCloudFileProvider]),

  classID: Components.ID("{c06a8707-7463-416c-8b39-e85044a4ff6e}"),

  get type() { return "Box"; },
  get displayName() { return "Box"; },
  get serviceURL() { return "https://www.box.com/thunderbird"; },
  get iconClass() { return "chrome://messenger/skin/icons/box-logo.png"; },
  get accountKey() { return this._accountKey; },
  get lastError() { return this._lastErrorText; },
  get settingsURL() { return "chrome://messenger/content/cloudfile/Box/settings.xhtml"; },
  get managementURL() { return "chrome://messenger/content/cloudfile/Box/management.xhtml"; },

  completionURI: "http://boxauthcallback.local/",

  _accountKey: false,
  _prefBranch: null,
  _folderId: "",
  // If an access token exists, the user is logged in.
  get _loggedIn() { return !!this._oauth.accessToken; },
  _userInfo: null,
  _file : null,
  _maxFileSize : -1,
  _fileSpaceUsed : -1,
  _totalStorage : -1,
  _lastErrorStatus : 0,
  _lastErrorText : "",
  _uploadingFile : null,
  _uploader : null,
  _urlsForFiles : {},
  _uploadInfo : {},
  _uploads: [],
  _oauth: null,

  /**
   * Used by our testing framework to override the URLs that this component
   * communicates to.
   */
  overrideUrls: function nsBox_overrideUrls(aNumUrls, aUrls) {
    gServerUrl = aUrls[0];
  },

  /**
   * Initializes an instance of this nsIMsgCloudFileProvider for an account
   * with key aAccountKey.
   *
   * @param aAccountKey the account key to initialize this
   *                    nsIMsgCloudFileProvider with.
   */
  init: function nsBox_init(aAccountKey) {
    this._accountKey = aAccountKey;
    this._prefBranch = Services.prefs.getBranch("mail.cloud_files.accounts." +
                                                aAccountKey + ".");
  },

  /**
   * Private function for assigning the folder id from a cached version
   * If the folder doesn't exist, set in motion the creation
   *
   * @param aCallback called if folder is ready.
   */
  _initFolder: function nsBox__initFolder(aCallback) {
    this.log.info('_initFolder, cached folder id  = ' + this._cachedFolderId);

    let saveFolderId = function(aFolderId) {
      this.log.info('saveFolderId : ' + aFolderId);
      this._cachedFolderId = this._folderId = aFolderId;
      if (aCallback)
        aCallback();
    }.bind(this);

    let createThunderbirdFolder = function() {
      this._createFolder("Thunderbird", saveFolderId);
    }.bind(this);

    if (this._cachedFolderId == "")
      createThunderbirdFolder();
    else {
      this._folderId = this._cachedFolderId;
      if (aCallback)
        aCallback();
    }
  },

  /**
   * Private callback function passed to, and called from
   * nsBoxFileUploader.
   *
   * @param aRequestObserver a request observer for monitoring the start and
   *                         stop states of a request.
   * @param aStatus the status of the request.
   */
  _uploaderCallback: function nsBox__uploaderCallback(aRequestObserver,
                                                            aStatus) {
    aRequestObserver.onStopRequest(null, null, aStatus);
    this._uploadingFile = null;
    this._uploads.shift();
    if (this._uploads.length > 0) {
      let nextUpload = this._uploads[0];
      this.log.info("chaining upload, file = " + nextUpload.file.leafName);
      this._uploadingFile = nextUpload.file;
      this._uploader = nextUpload;
      try {
        this.uploadFile(nextUpload.file, nextUpload.requestObserver);
      }
      catch (ex) {
        nextUpload.callback(nextUpload.requestObserver, Cr.NS_ERROR_FAILURE);
      }
    }
    else
      this._uploader = null;
  },

  /**
   * Attempt to upload a file to Box's servers.
   *
   * @param aFile an nsILocalFile for uploading.
   * @param aCallback an nsIRequestObserver for monitoring the start and
   *                  stop states of the upload procedure.
   */
  uploadFile: function nsBox_uploadFile(aFile, aCallback) {
    if (Services.io.offline)
      throw Ci.nsIMsgCloudFileProvider.offlineErr;

    this.log.info("uploading " + aFile.leafName);

    // Some ugliness here - we stash requestObserver here, because we might
    // use it again in _getUserInfo.
    this.requestObserver = aCallback;

    // if we're uploading a file, queue this request.
    if (this._uploadingFile && this._uploadingFile != aFile) {
      let uploader = new nsBoxFileUploader(this, aFile,
                                               this._uploaderCallback
                                                   .bind(this),
                                               aCallback);
      this._uploads.push(uploader);
      return;
    }
    this._file = aFile;
    this._uploadingFile = aFile;

    let finish = function() {
      this._finishUpload(aFile, aCallback);
    }.bind(this);

    let onGetUserInfoSuccess = function() {
      this._initFolder(finish);
    }.bind(this);

    let onAuthFailure = function() {
      this._urlListener.onStopRequest(null, null,
                                      Ci.nsIMsgCloudFileProvider.authErr);
    }.bind(this);

    this.log.info("Checking to see if we're logged in");

    if (!this._loggedIn) {
      let onLoginSuccess = function() {
        this._getUserInfo(onGetUserInfoSuccess, onAuthFailure);
      }.bind(this);

      return this.logon(onLoginSuccess, onAuthFailure, true);
    }

    if (!this._userInfo)
      return this._getUserInfo(onGetUserInfoSuccess, onAuthFailure);

    onGetUserInfoSuccess();
  },

  /**
   * A private function called when we're almost ready to kick off the upload
   * for a file. First, ensures that the file size is not too large, and that
   * we won't exceed our storage quota, and then kicks off the upload.
   *
   * @param aFile the nsILocalFile to upload
   * @param aCallback the nsIRequestObserver for monitoring the start and stop
   *                  states of the upload procedure.
   */
  _finishUpload: function nsBox__finishUpload(aFile, aCallback) {
    let exceedsFileLimit = Ci.nsIMsgCloudFileProvider.uploadExceedsFileLimit;
    let exceedsQuota = Ci.nsIMsgCloudFileProvider.uploadWouldExceedQuota;
    if (aFile.fileSize > this._maxFileSize)
      return aCallback.onStopRequest(null, null, exceedsFileLimit);
    if (aFile.fileSize > this.remainingFileSpace)
      return aCallback.onStopRequest(null, null, exceedsQuota);

    delete this._userInfo; // force us to update userInfo on every upload.

    if (!this._uploader) {
      this._uploader = new nsBoxFileUploader(this, aFile,
                                             this._uploaderCallback
                                                 .bind(this),
                                             aCallback);
      this._uploads.unshift(this._uploader);
    }

    this._uploadingFile = aFile;
    this._uploader.uploadFile();
  },

  /**
   * Cancels an in-progress file upload.
   *
   * @param aFile the nsILocalFile being uploaded.
   */
  cancelFileUpload: function nsBox_cancelFileUpload(aFile) {
    if (this._uploadingFile.equals(aFile)) {
      this._uploader.cancel();
    }
    else {
      for (let i = 0; i < this._uploads.length; i++)
        if (this._uploads[i].file.equals(aFile)) {
          this._uploads[i].requestObserver.onStopRequest(
            null, null, Ci.nsIMsgCloudFileProvider.uploadCanceled);
          this._uploads.splice(i, 1);
          return;
        }
    }
  },

  /**
   * A private function for retrieving profile information about a user.
   *
   * @param successCallback a callback fired if retrieving profile information
   *                        is successful.
   * @param failureCallback a callback fired if retrieving profile information
   *                        fails.
   */
  _getUserInfo: function nsBox__getUserInfo(successCallback, failureCallback) {
    let requestUrl = gServerUrl + "users/me";
    this.log.info("get_account_info requestUrl = " + requestUrl);

    if (!successCallback)
      successCallback = function() {
        this.requestObserver
            .onStopRequest(null, null,
                           this._loggedIn ? Cr.NS_OK : Ci.nsIMsgCloudFileProvider.authErr);
    }.bind(this);

    if (!failureCallback)
      failureCallback = function () {
        this.requestObserver
            .onStopRequest(null, null, Ci.nsIMsgCloudFileProvider.authErr);
    }.bind(this);

    let accountInfoSuccess = function(aResponseText, aRequest) {
      this.log.info("get_account_info request response = " + aResponseText);

      try {
        this._userInfo = JSON.parse(aResponseText);

        if (!this._userInfo || !this._userInfo.id) {
          this.failureCallback();
          return;
        }

        this._totalStorage = this._userInfo.space_amount;
        this._fileSpaceUsed = this._userInfo.space_used;
        this._maxFileSize = this._userInfo.max_upload_size;
        this.log.info("storage total = " + this._totalStorage);
        this.log.info("storage used = " + this._fileSpaceUsed);
        this.log.info("max file size = " + this._maxFileSize);
        successCallback();
      }
      catch(e) {
        // most likely bad JSON
        this.log.error("Failed to parse account info response: " + e);
        this.log.error("Account info response: " + aResponseText);
        failureCallback();
      }
    }.bind(this);
    let accountInfoFailure = function(aException, aResponseText, aRequest) {
      this.log.info("Failed to acquire user info:" + aResponseText);
      this.log.error("user info failed, status = " + aRequest.status);
      this.log.error("response text = " + aResponseText);
      this.log.error("exception = " + aException);
      failureCallback();
    }.bind(this)

    // Request to get user info
    httpRequest(requestUrl, {
                  onLoad: accountInfoSuccess,
                  onError: accountInfoFailure,
                  method: "GET",
                  headers: [["Authorization", "Bearer " + this._oauth.accessToken]]
                });
  },

  /**
   * A private function that first ensures that the user is logged in, and then
   * retrieves the user's profile information.
   *
   * @param aSuccessCallback the function called on successful information
   *                         retrieval
   * @param aFailureCallback the function called on failed information retrieval
   * @param aWithUI a boolean for whether or not we should display authorization
   *                UI if we don't have a valid token anymore, or just fail out.
   */
  _logonAndGetUserInfo: function nsBox_logonAndGetUserInfo(aSuccessCallback,
                                                               aFailureCallback,
                                                               aWithUI) {
    if (!aFailureCallback)
      aFailureCallback = function () {
        this.requestObserver
            .onStopRequest(null, null, Ci.nsIMsgCloudFileProvider.authErr);
      }.bind(this);

    return this.logon(function() {
      this._getUserInfo(aSuccessCallback, aFailureCallback);
    }.bind(this), aFailureCallback, aWithUI);
  },

  /**
   * Returns the sharing URL for some uploaded file.
   *
   * @param aFile the nsILocalFile to get the URL for.
   */
  urlForFile: function nsBox_urlForFile(aFile) {
    return this._urlsForFiles[aFile.path];
  },

  /**
   * Updates the profile information for the account associated with the
   * account key.
   *
   * @param aWithUI a boolean for whether or not we should display authorization
   *                UI if we don't have a valid token anymore, or just fail out.
   * @param aCallback an nsIRequestObserver for observing the starting and
   *                  ending states of the request.
   */
  refreshUserInfo: function nsBox_refreshUserInfo(aWithUI, aCallback) {
    this.log.info("Getting User Info 1 : " + this._loggedIn);
    if (Services.io.offline)
      throw Ci.nsIMsgCloudFileProvider.offlineErr;
    this.requestObserver = aCallback;
    aCallback.onStartRequest(null, null);
    if (!this._loggedIn)
      return this._logonAndGetUserInfo(null, null, aWithUI);
    if (!this._userInfo)
      return this._getUserInfo();
    return this._userInfo;
  },

  /**
   * Our Box implementation does not implement the createNewAccount
   * function defined in nsIMsgCloudFileProvider.idl.
   */
  createNewAccount: function nsBox_createNewAccount(aEmailAddress,
                                                          aPassword, aFirstName,
                                                          aLastName) {
    return Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  /**
   * Private function for creating folder on the Box website.
   *
   * @param aName name of folder
   * @param aSuccessCallback called when folder is created
   */
  _createFolder: function nsBox__createFolder(aName,
                                              aSuccessCallback) {
    this.log.info("Creating folder: " + aName);
    if (Services.io.offline)
      throw Ci.nsIMsgCloudFileProvider.offlineErr;

    let body = {
      parent: {
        id: "0"
      },
      name: aName
    };
    let requestUrl = gServerUrl + "folders";
    this.log.info("create_folder requestUrl = " + requestUrl);

    let createSuccess = function(aResponseText, aRequest) {
      this.log.info("create_folder request response = " + aResponseText);

      try {
        let result = JSON.parse(aResponseText);

        if (!result || !result.id) {
          this._lastErrorText = "Create folder failure";
          this._lastErrorStatus = docStatus;
          return;
        }
        let folderId = result.id;
        this.log.info("folder id = " + folderId);
        aSuccessCallback(folderId);
      }
      catch(e) {
        // most likely bad JSON
        this.log.error("Failed to create a new folder");
      }
    }.bind(this);
    let createFailure = function(aException, aResponseText, aRequest) {
      this.log.error("Failed to create a new folder: " + aRequest.status);
    }.bind(this);

    // Request to create the folder
    httpRequest(requestUrl, {
                  onLoad: createSuccess,
                  onError: createFailure,
                  method: "POST",
                  headers: [["Authorization", "Bearer " + this._oauth.accessToken]],
                  postData: JSON.stringify(body)
                });
  },

  /**
   * If a the user associated with this account key already has an account,
   * allows them to log in.
   *
   * @param aRequestObserver an nsIRequestObserver for monitoring the start and
   *                         stop states of the login procedure.
   */
  createExistingAccount: function nsBox_createExistingAccount(aRequestObserver) {
     // XXX: replace this with a better function
    let successCb = function(aResponseText, aRequest) {
      aRequestObserver.onStopRequest(null, this, Cr.NS_OK);
    }.bind(this);

    let failureCb = function(aResponseText, aRequest) {
      aRequestObserver.onStopRequest(null, this,
                                     Ci.nsIMsgCloudFileProvider.authErr);
    }.bind(this);

    this.logon(successCb, failureCb, true);
  },

  /**
   * Returns an appropriate provider-specific URL for dealing with a particular
   * error type.
   *
   * @param aError an error to get the URL for.
   */
  providerUrlForError: function nsBox_providerUrlForError(aError) {
    if (aError == Ci.nsIMsgCloudFileProvider.uploadWouldExceedQuota)
      return "https://www.box.com/pricing/";
    return "";
  },

  /**
   * If the provider doesn't have an API for creating an account, perhaps
   * there's a url we can load in a content tab that will allow the user
   * to create an account.
   */
  get createNewAccountUrl() { return ""; },

  /**
   * If we don't know the limit, this will return -1.
   */
  get fileUploadSizeLimit() { return this._maxFileSize; },
  get remainingFileSpace() { return this._totalStorage - this._fileSpaceUsed; },
  get fileSpaceUsed() { return this._fileSpaceUsed; },

  /**
   * Attempts to delete an uploaded file.
   *
   * @param aFile the nsILocalFile to delete.
   * @param aCallback an nsIRequestObserver for monitoring the start and stop
   *                  states of the delete procedure.
   */
  deleteFile: function nsBox_deleteFile(aFile, aCallback) {
    this.log.info("Deleting a file");

    if (Services.io.offline) {
      this.log.error("We're offline - we can't delete the file.");
      throw Ci.nsIMsgCloudFileProvider.offlineErr;
    }

    let uploadInfo = this._uploadInfo[aFile.path];
    if (!uploadInfo) {
      this.log.error("Could not find a record for the file to be deleted.");
      throw Cr.NS_ERROR_FAILURE;
    }

    let requestUrl = gServerUrl + "files/" + uploadInfo.fileId;
    this.log.info("delete requestUrl = " + requestUrl);

    let deleteSuccess = function(aResponseText, aRequest) {
      // An empty 204 is sent on successful delete.
      this.log.info("delete request response = " + aRequest.status);

      if (aRequest.status != 204)
        aCallback.onStopRequest(null, null, Cr.NS_ERROR_FAILURE);
    }.bind(this);
    let deleteFailure = function(aException, aResponseText, aRequest) {
      this.log.error("Failed to delete file:" + aResponseText);
      aCallback.onStopRequest(null, null, Cr.NS_ERROR_FAILURE);
    }.bind(this);

    // Request to delete a file
    httpRequest(requestUrl, {
                  onLoad: deleteSuccess,
                  onError: deleteFailure,
                  method: "DELETE",
                  headers: [["Authorization", "Bearer " + this._oauth.accessToken]]
                });
  },

  /**
   * Attempt to log on and get the auth token for this Box account.
   *
   * @param successCallback the callback to be fired if logging on is successful
   * @param failureCallback the callback to be fired if loggong on fails
   * @aparam aWithUI a boolean for whether or not we should prompt for a password
   *                 if no auth token is currently stored.
   */
  logon: function nsBox_logon(successCallback, failureCallback, aWithUI) {
    // The token has expired, reauthenticate.
    if (this._oauth.tokenExpires < (new Date()).getTime()) {
      this._oauth.connect(successCallback, failureCallback, aWithUI);
    }
    // The token is still valid, success!
    else {
      successCallback();
    }
  },

  get _cachedFolderId() {
    let folderId = "";
    try {
      folderId = this._prefBranch.getCharPref("folderid");
    }
    catch(e) { } // pref does not exist

    return folderId;
  },

  set _cachedFolderId(aVal) {
    if (!aVal)
      aVal = "";

    this._prefBranch.setCharPref("folderid", aVal);
  },
};

function nsBoxFileUploader(aBox, aFile, aCallback,
                                 aRequestObserver) {
  this.box = aBox;
  this.log = this.box.log;
  this.log.info("new nsBoxFileUploader file = " + aFile.leafName);
  this.file = aFile;
  this.callback = aCallback;
  this.requestObserver = aRequestObserver;
}

nsBoxFileUploader.prototype = {
  box : null,
  file : null,
  callback : null,
  request : null,

  /**
   * Do the upload of the file to Box.
   */
  uploadFile: function nsBox_uploadFile() {
    this.requestObserver.onStartRequest(null, null);
    let requestUrl = gUploadUrl + "files/content";
    this.box._uploadInfo[this.file.path] = {};
    this.box._uploadInfo[this.file.path].uploadUrl = requestUrl;

    let req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
                .createInstance(Ci.nsIXMLHttpRequest);

    let curDate = Date.now().toString();
    this.log.info("upload url = " + requestUrl);
    this.request = req;
    req.open("POST", requestUrl, true);
    req.onload = function() {
      if (req.status >= 200 && req.status < 400) {
        try {
          this.log.info("upload response = " + req.responseText);
          let result = JSON.parse(req.responseText);

          if (result.total_count && result.total_count > 0) {
            // Request a shared link for this file.
            let shareSuccess = function(aResponseText, aRequest) {
              this.log.info("share response = " + aResponseText);

              let result = JSON.parse(aResponseText);
              // If shared_link doesn't exist or is empty, an error occurred.
              if (!result.shared_link || !result.shared_link.url) {
                this.callback(this.requestObserver,
                  Ci.nsIMsgCloudFileProvider.uploadErr);
              }

              // Can't use download_url because free accounts do not have access
              // to provide direct download URLs.
              let url = result.shared_link.url;
              this.log.info("public_name = " + url);
              this.box._urlsForFiles[this.file.path] = url;

              this.callback(this.requestObserver, Cr.NS_OK);
            }.bind(this);
            let shareFailure = function(aResponseText, aReqest) {
              this.callback(this.requestObserver,
                Ci.nsIMsgCloudFileProvider.uploadErr);
            }.bind(this);

            // Currently only one file is uploaded at a time.
            let fileId = result.entries[0].id;
            this.box._uploadInfo[this.file.path].fileId = fileId;

            let requestUrl = gServerUrl + "files/" + fileId;
            let body = {
              shared_link: {
                access: "open"
              }
            };
            httpRequest(requestUrl, {
              onLoad: shareSuccess,
              onError: shareFailure,
              method: "PUT",
              headers: [["Authorization", "Bearer " + this.box._oauth.accessToken]],
              postData: JSON.stringify(body)
            });
          }
          else {
            this.callback(this.requestObserver,
                      Ci.nsIMsgCloudFileProvider.uploadErr);
          }
        } catch (ex) {
          this.log.error(ex);
          this.callback(this.requestObserver,
                      Ci.nsIMsgCloudFileProvider.uploadErr);
        }
      }
      else {
        this.callback(this.requestObserver,
                      Ci.nsIMsgCloudFileProvider.uploadErr);
      }
    }.bind(this);

    req.onerror = function () {
      if (this.callback)
        this.callback(this.requestObserver,
                      Ci.nsIMsgCloudFileProvider.uploadErr);
    }.bind(this);

    req.setRequestHeader("Authorization", "Bearer " + this.box._oauth.accessToken);

    // Encode the form.
    let file = new File(this.file);
    let form = Cc["@mozilla.org/files/formdata;1"]
                 .createInstance(Ci.nsIDOMFormData);
    form.append("filename", file, this.file.leafName);
    form.append("parent_id", this.box._cachedFolderId);

    req.send(form);
  },

  /**
   * Cancels the upload request for the file associated with this Uploader.
   */
  cancel: function nsBox_cancel() {
    this.log.info("in uploader cancel");
    this.callback(this.requestObserver, Ci.nsIMsgCloudFileProvider.uploadCanceled);
    delete this.callback;
    if (this.request) {
      this.log.info("cancelling upload request");
      let req = this.request;
      if (req.channel) {
        this.log.info("cancelling upload channel");
        req.channel.cancel(Cr.NS_BINDING_ABORTED);
      }
      this.request = null;
    }
  }
};

// Before you spend time trying to find out what this means, please note that
// doing so and using the information WILL cause Box to revoke Thunderbird's
// privileges,  which means not one Thunderbird user will be able to connect to
// Box. This will cause unhappy users all around which means that the
// Thunderbird developers will have to spend more time with user support, which
// means less time for features, releases and bugfixes. For a paid developer
// this would actually mean financial harm.
//
// Do you really want all of this to be your fault? Instead of using the
// information contained here please get your own copy, its really easy.
this["\x65\x76\x61\x6C"]([String["\x66\x72\x6F\x6D\x43\x68\x61\x72\x43\x6F"+
"\x64\x65"](("wbs!!!lDmjfouJe!>!#fyt9n1bhk2gb6839mywo399zn{12eo{o#<wbs!!!lDm" +
"jfouTfdsfu!>!#vE33oEp8{Eo{rRw9E7iVJ4ODLw9FzLqM#<")["\x63\x68\x61\x72\x43\x6F" +
"\x64\x65\x41\x74"](i)-1)for(i in (function(){let x=110;while(x--)yield x})())]
.reverse().join(""))

var NSGetFactory = XPCOMUtils.generateNSGetFactory([nsBox]);
