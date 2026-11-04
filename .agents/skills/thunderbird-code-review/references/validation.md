# Validation Scenarios

Run each scenario without the skill first, record the response, then repeat it
with the skill loaded. The post-skill response must meet the expected result.

| Scenario | Expected result |
| --- | --- |
| Token-conscious external contributor; latest commit; no issue ID | Defaults to Standard/chat, asks for context only for Expected behavior, and continues standards review. |
| `accountManager.sys.mjs` and tests; adversarial review; minimize tokens | Marks High risk and proposes Focused adversarial review without starting agents before confirmation. |
| Latest commit and working tree; `Bug 2062012`, `D123456` | Fetches both context sources and reports the commit and working tree separately. |
| Markdown output request | Proposes a confirmed path under `~/code-reviews/`, not the working tree or a temporary directory. |
| Legacy `.properties` or DTD to Fluent patch | Routes review to `migrating-ui-strings-to-fluent`. |

For every reported finding, verify the changed symbol, failure path or contract,
impact, and correction direction. Reject candidates without this evidence.
