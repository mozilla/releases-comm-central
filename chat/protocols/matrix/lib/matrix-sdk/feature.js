"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ServerSupport = exports.Feature = void 0;
exports.buildFeatureSupportMap = buildFeatureSupportMap;
/*
Copyright 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
let ServerSupport = exports.ServerSupport = /*#__PURE__*/function (ServerSupport) {
  ServerSupport[ServerSupport["Stable"] = 0] = "Stable";
  ServerSupport[ServerSupport["Unstable"] = 1] = "Unstable";
  ServerSupport[ServerSupport["Unsupported"] = 2] = "Unsupported";
  return ServerSupport;
}({});
let Feature = exports.Feature = /*#__PURE__*/function (Feature) {
  Feature["Thread"] = "Thread";
  Feature["ThreadUnreadNotifications"] = "ThreadUnreadNotifications";
  Feature["LoginTokenRequest"] = "LoginTokenRequest";
  Feature["RelationBasedRedactions"] = "RelationBasedRedactions";
  Feature["AccountDataDeletion"] = "AccountDataDeletion";
  Feature["RelationsRecursion"] = "RelationsRecursion";
  Feature["IntentionalMentions"] = "IntentionalMentions";
  return Feature;
}({});
const featureSupportResolver = {
  [Feature.Thread]: {
    unstablePrefixes: ["org.matrix.msc3440"],
    matrixVersion: "v1.3"
  },
  [Feature.ThreadUnreadNotifications]: {
    unstablePrefixes: ["org.matrix.msc3771", "org.matrix.msc3773"],
    matrixVersion: "v1.4"
  },
  [Feature.LoginTokenRequest]: {
    unstablePrefixes: ["org.matrix.msc3882"]
  },
  [Feature.RelationBasedRedactions]: {
    unstablePrefixes: ["org.matrix.msc3912"]
  },
  [Feature.AccountDataDeletion]: {
    unstablePrefixes: ["org.matrix.msc3391"]
  },
  [Feature.RelationsRecursion]: {
    unstablePrefixes: ["org.matrix.msc3981"]
  },
  [Feature.IntentionalMentions]: {
    unstablePrefixes: ["org.matrix.msc3952_intentional_mentions"],
    matrixVersion: "v1.7"
  }
};
async function buildFeatureSupportMap(versions) {
  const supportMap = new Map();
  for (const [feature, supportCondition] of Object.entries(featureSupportResolver)) {
    const supportMatrixVersion = versions.versions?.includes(supportCondition.matrixVersion || "") ?? false;
    const supportUnstablePrefixes = supportCondition.unstablePrefixes?.every(unstablePrefix => {
      return versions.unstable_features?.[unstablePrefix] === true;
    }) ?? false;
    if (supportMatrixVersion) {
      supportMap.set(feature, ServerSupport.Stable);
    } else if (supportUnstablePrefixes) {
      supportMap.set(feature, ServerSupport.Unstable);
    } else {
      supportMap.set(feature, ServerSupport.Unsupported);
    }
  }
  return supportMap;
}