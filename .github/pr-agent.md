# PR-Agent reviews

PR-Agent posts review comments on non-draft pull requests opened, reopened,
marked ready for review, or updated from branches in this repository.
Fork pull requests and events sent by bots are skipped.

## Activation

1. Add an OpenAI API key as the `OPENAI_KEY` Actions repository secret at
   https://github.com/soshibench/plugins/settings/secrets/actions.
2. Land this setup through a pull request. Never merge into `main` locally.
3. Open or update a non-draft pull request and inspect the **PR-Agent review**
   workflow and its review comment.

The workflow uses OpenAI's `gpt-6.1-sol` model, with no fallback models.
OpenAI API usage is billed to the account owning the API key. PR diffs and
review context are sent to OpenAI. No API key belongs in source control.

## Review behavior

The workflow enables only `/review`, including on subsequent pushes.
Automatic descriptions, code suggestions, review labels, and approval are
disabled. There is no issue-comment trigger for other commands and no checkout
or execution of the PR's code. The token cannot push repository contents.
Review feedback uses a persistent comment to reduce repeated top-level posts.

PR-Agent loads repository context from the default branch, including
`AGENTS.md` when present. Context files are listed in the workflow.
Repository-specific instructions are in `.pr_agent.toml`.
Reviews complement the project's lint, type checks, and tests.

## Updating PR-Agent

The workflow pins the `pragent/pr-agent` Docker runtime by digest rather than
using a rolling action wrapper. Its setup was checked against upstream
revision `04b641aa3c8ddbff111eeafb8cf0e8ea1ab8df2c`.
When upgrading, resolve and review a new image digest and verify the review-only
settings against that release before changing the workflow.
