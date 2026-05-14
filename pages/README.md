# Atlantisboard — GitHub Pages (Jekyll)

This directory is a small marketing and documentation landing site built with [Jekyll](https://jekyllrb.com/) for [GitHub Pages](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll).

## Before you publish

1. Edit `_config.yml` and set `repository` to your GitHub namespace in the form `owner/repo` (replace the `YOUR_GITHUB_USER/YOUR_REPO_NAME` placeholder). This powers **Wiki** and **Download** links in the layout and pages.
2. Confirm `wiki_branch` and `wiki_path` match your repository (defaults: `main` and `docs/wiki`).

## Local preview

`baseurl` is set for **Project Pages** (`https://USER.github.io/REPO/`). Preview with the same path prefix:

```bash
cd pages
bundle install
bundle exec jekyll serve --livereload --baseurl "/atlantisboard"
```

Open <http://127.0.0.1:4000/atlantisboard/> (Jekyll prints the exact URL). If you change `baseurl` in `_config.yml`, use that value after `--baseurl`.

## Deploy from the `pages/` folder

GitHub’s built-in “docs folder only” publishing does not use a folder named `pages`. This repo includes a workflow that builds Jekyll from `./pages` and deploys to GitHub Pages. Enable **Pages** → **GitHub Actions** in the repository settings after merging the workflow file.

## Assets

- `assets/images/atlantisboard-gem.png` — brand mark used in the header and hero (palette reference: deep blues on black).
