---
title: Home
---

<section class="hero" aria-labelledby="hero-title">
  <div class="hero__content">
    <h1 id="hero-title">Self-hosted Kanban, built for your team</h1>
    <p class="hero__lead">
      Atlantisboard combines workspaces, real-time boards, and fine-grained permissions
      so you stay in control of your data and your workflow.
    </p>
    <div class="hero__actions">
      <a class="btn btn--primary" href="https://github.com/{{ site.repository }}/releases" rel="noopener noreferrer">Download latest release</a>
      <a class="btn btn--ghost" href="{{ '/about/' | relative_url }}">About the project</a>
    </div>
  </div>
  <div class="hero__visual">
    <div class="hero__gem-wrap" aria-hidden="true">
      <span class="hero__orbit"></span>
      <span class="hero__orbit hero__orbit--2"></span>
      <img class="hero__gem" src="{{ '/assets/images/atlantisboard-gem.png' | relative_url }}" width="260" height="260" alt="" decoding="async" />
    </div>
  </div>
</section>

<div class="panel-grid">
  <article class="panel">
    <h2>Real-time</h2>
    <p>Live updates across lists, cards, and collaborators as work changes.</p>
  </article>
  <article class="panel">
    <h2>Self-hosted</h2>
    <p>Run on your infrastructure with MongoDB, Redis, and object storage you trust.</p>
  </article>
  <article class="panel">
    <h2>Permissions</h2>
    <p>Workspaces and boards with roles that match how your organization works.</p>
  </article>
</div>
