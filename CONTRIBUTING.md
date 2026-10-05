# Contribution Guidelines

Please read the following guidelines if you are planning to contribute to the Thunderbird project. Thank you so much for your time!

1) **You are responsible for what you submit.** Whether it's code, documentation, or anything else, no matter what tool you've used, you are expected to understand what you have submitted and you should be able to explain it at minimum at a high level without the use of AI.

2) **Talk to the maintainer before submitting a patch OR submit a WIP patch.**  
   a) **Reach out / file an issue or respond to the issue you plan to work on before submission of any work.** Discuss the work you would like to submit with maintainers before you submit it to clarify any unclear or vague requirements. This is most important for significant changes like larger bugs, new issues, or features. Without this step, you risk submitting a patch that is rejected for any number of reasons, so it is best to align with the maintainer on a solution beforehand.  
   b) **OR submit a WIP patch to start the discussion.** Sometimes submitting a quick WIP patch is a good way to communicate your proposed solution. This option is more suitable for trivial fixes or existing and triaged bugs. Just be aware that if you skip a conversation with the maintainer and go right to this step, your WIP patch may need to be scrapped to align with the direction the maintainer is envisioning.

3) **Do not include unrelated refactoring or drive-by "improvements".** All code in a pull request should directly address the issue or issues being solved.

4) **Where possible, avoid the creation of comprehension debt.** Submissions must follow established architecture, formatting, and code organization. They should use existing languages, frameworks, and libraries where possible. Do not submit code that rewrites or refactors existing work, introduces new frameworks, or major libraries without first asking maintainers. Maintainers have the final word on refactors and any languages, dependencies, and tools used in a project.  
   a) **Try to keep your changeset small.** Pull Requests that are less than 500 lines, across a minimum number of files, helps ensure that the changeset is appropriately targeted and reviewable.

5) **Expect your level of effort to be mirrored.** If you spent 5 minutes having an agent write a document or patch, you should not expect a human to spend hours reviewing and critiquing your submission in detail. If an LLM was used to help generate a patch, it is encouraged to include the original thought that went into the LLM's patch creation process.

6) **Submissions should include tests and any relevant documentation.** If there are no tests in the project, propose adding them whenever possible.

7) **Document your changes.** While working on your submission, you have naturally built a certain understanding of the problem you're trying to solve, including the code area and components it involves and how you think it would be best addressed. Adding a short explanation of your understanding of the problem and the approach you've taken, either in the commit message or in a separate comment on the relevant bug/issue, makes it easier for the reviewer to look through your code changes and understand your thought process.

8) **Humanize or write comments (within code and throughout the code review process) by hand.** While we’ve become accustomed to interacting with a variety of automated systems in our daily lives, a good chunk of the joy involved in our work is to share knowledge with each other and refine the code so that it can be reused and understood by humans.

9) **Be wary of license infringement.** Much of our work is under the MPL license and we must all take care not to introduce refactored code that originally came from licensed software which can be rewritten and translated using LLM, then relabelled under our licence.

10) **Be transparent.** Transparency will often help to share prompts and your model when submitting code for review. Refining all aspects of our workflow is important, and we can all benefit from a collective evolution of skills and prompts that improve over time with input from the team and community.
