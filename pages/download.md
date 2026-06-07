---
title: Download
permalink: /download/
description: Download Atlantisboard from GitHub Releases or npm and run the setup wizard on your server.
---

<h1 class="page-title">Download Atlantisboard</h1>

<div class="prose">
  <p>
    Install Atlantisboard on your own server. Pick a package below, then follow the three steps to unpack and run the setup wizard.
  </p>
  <p>
    You need a <strong>Linux</strong> machine with <strong>Docker</strong> (recommended) and a few common tools. On <strong>Debian 12</strong>, see the
    <a href="{{ '/wiki/debian-install/' | relative_url }}">Debian auto setup guide</a> or the general
    <a href="{{ '/wiki/npm-install/' | relative_url }}">install guide</a>.
  </p>
</div>

<section class="download-packages" aria-labelledby="download-packages-heading">
  <h2 id="download-packages-heading" class="download-section__title">Packages</h2>
  {% include download-packages.html %}
</section>

<section class="download-steps" aria-labelledby="download-steps-heading">
  <h2 id="download-steps-heading" class="download-section__title">Quick install (3 steps)</h2>
  <p class="download-steps__intro">
    These steps work the same whether you downloaded the <strong>GitHub zip</strong> or installed via <strong>npm</strong>.
  </p>

  <ol class="download-steps__list">
    <li class="download-step">
      <span class="download-step__number" aria-hidden="true">1</span>
      <div class="download-step__body">
        <h3 class="download-step__title">Get the package</h3>
        <p>
          <strong>GitHub:</strong> download <code>atlantisboard-&lt;version&gt;.zip</code> above and copy it to your server (for example with <code>scp</code>).
        </p>
        <p>
          <strong>npm:</strong> on the server run <code>npm install -g atlantisboard</code> (requires Node/npm and Bun on the host).
        </p>
      </div>
    </li>
    <li class="download-step">
      <span class="download-step__number" aria-hidden="true">2</span>
      <div class="download-step__body">
        <h3 class="download-step__title">Unzip (GitHub zip only)</h3>
        <p>On your server, unzip the archive and go into the folder:</p>
        {% assign dl = site.data.download %}
        {% assign zip_name = "atlantisboard-1.0.1.zip" %}
        {% assign folder_name = "atlantisboard-1.0.1" %}
        {% if dl.github.assets.size > 0 %}
          {% for asset in dl.github.assets %}
            {% if asset.kind == "full" %}
              {% assign zip_name = asset.name %}
              {% assign folder_name = asset.name | replace: ".zip", "" %}
            {% endif %}
          {% endfor %}
        {% endif %}
        <pre class="download-step__code"><code>unzip {{ zip_name }} -d {{ folder_name }}
cd {{ folder_name }}</code></pre>
        <p class="download-step__note">If you used npm, skip this step — the files are already installed globally.</p>
      </div>
    </li>
    <li class="download-step">
      <span class="download-step__number" aria-hidden="true">3</span>
      <div class="download-step__body">
        <h3 class="download-step__title">Run the setup wizard</h3>
        <p>Start the installer (use <code>sudo</code> if you are not root):</p>
        <pre class="download-step__code"><code>sudo ./atlantisboard-setup</code></pre>
        <p>
          The wizard walks you through Docker or manual setup, creates your <code>.env</code> file, and can configure systemd and a reverse proxy.
          When it finishes, open the URL it prints (usually <code>http://localhost:3000</code>) and create your first account.
        </p>
      </div>
    </li>
  </ol>
</section>

<div class="cta-card">
  <p class="cta-card__lead">
    Prefer Docker Compose from source, or a full production checklist? See the wiki.
  </p>
  <a class="btn btn--primary" href="{{ '/wiki/debian-install/' | relative_url }}">Debian auto setup</a>
  <a class="btn btn--ghost" href="{{ '/wiki/docker-compose-install/' | relative_url }}">Docker Compose (from source)</a>
  <a class="btn btn--ghost" href="{{ '/wiki/' | relative_url }}">Documentation</a>
</div>
