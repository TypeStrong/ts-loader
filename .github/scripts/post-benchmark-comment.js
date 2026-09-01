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
 *   } }, paginate: (endpoint: unknown, options: unknown) => Promise<Array<{ id: number, body: string }>> },
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

  try {
    // paginate (rather than a single listComments call) so the marker is
    // still found on PRs with more comments than fit on one page - otherwise
    // it'd never be found past page 1, and every run would create a fresh
    // duplicate instead of updating the existing one.
    const comments = await github.paginate(github.rest.issues.listComments, {
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
  } catch (err) {
    if (err.status === 403) {
      // Fork PRs may not have permission to write comments; results are
      // still available in the job summary / artifacts.
      return;
    }
    throw err;
  }
};
