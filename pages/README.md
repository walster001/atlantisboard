# Atlantisboard — GitHub Pages (Jekyll)

This directory is a small marketing and documentation landing site built with [Jekyll](https://jekyllrb.com/) for [GitHub Pages](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll).

## Before you publish

1. Edit `_config.yml` and set `repository` to your GitHub namespace in the form `owner/repo` (replace the `YOUR_GITHUB_USER/YOUR_REPO_NAME` placeholder). This powers **Wiki** and **Download** links in the layout and pages.
2. Confirm `wiki_branch` and `wiki_path` match your repository (defaults: `main` and `docs/wiki`).

## Local preview

With `baseurl: ""` (site at the domain root), run:

```bash
cd pages
bundle install
bundle exec jekyll serve --livereload
```

Open <http://127.0.0.1:4000/> (or the URL Jekyll prints). If you ever publish under a subpath again, set `baseurl` in `_config.yml` (e.g. `/repo-name`) and run `jekyll serve --baseurl "/repo-name"` to match.

## Custom apex domain (`atlantis.social`)

1. In the GitHub repo: **Settings → Pages → Custom domain** → enter `atlantis.social`, save, and enable **Enforce HTTPS** once DNS is valid.
2. At your DNS host for `atlantis.social`, add the **apex** records GitHub lists for your site (IPv4 **A** and optional IPv6 **AAAA**). Follow the current values in GitHub’s guide: [Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
3. This Jekyll source includes a root **`CNAME`** file (one line: `atlantis.social`) so each build keeps the domain configured for Pages.

`url` in `_config.yml` is set to `https://atlantis.social` so `relative_url`, `absolute_url`, and `{% seo %}` match the live host.

## Deploy from the `pages/` folder

GitHub’s built-in “docs folder only” publishing does not use a folder named `pages`. This repo includes a workflow that builds Jekyll from `./pages` and deploys to GitHub Pages. Enable **Pages** → **GitHub Actions** in the repository settings after merging the workflow file.

## Assets

- `assets/images/atlantisboard-gem.png` — brand mark used in the header and hero (palette reference: deep blues on black).
