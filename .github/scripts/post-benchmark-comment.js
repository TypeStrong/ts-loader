const fs = require('fs');

/**
 * Creates or updates the benchmark result comment identified by `marker`.
 * Shared by the "comment on PR" steps in benchmark.yml (Ubuntu + Windows jobs).
 *
 * @param {{
 *   github: { rest: { issues: {
 *     listComments: (options: { owner: string, repo: string, issue_number: number }) => Promise<{ data: Array<{ id: number, body: string }> }>,
 *     updateComment: (options: { owner: string, repo: string, comment_id: number, body: string }) => Promise<unknown>,
 *     createComment: (options: { owner: string, repo: string, issue_number: number, body: string }) => Promise<unknown>
 *   } } },
 *   context: { repo: { owner: string, repo: string }, issue: { number: number } },
 *   resultsPath: string,
 *   marker: string,
 *   title: string
 * }} options GitHub Actions `github-script` inputs.
 * @returns {Promise<void>}
 */
module.exports = async ({ github, context, resultsPath, marker, title }) => {
  let body;
  try {
    body = fs.readFileSync(resultsPath, 'utf8');
  } catch {
    return; // benchmark run failed before producing results - nothing to post
  }
  body = `${marker}\n### ${title}\n\n${body}`;

  const { data: comments } = await github.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
  });
  const existing = comments.find((c) => c.body.includes(marker));
  if (existing) {
    await github.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number,
      body,
    });
  }
};
