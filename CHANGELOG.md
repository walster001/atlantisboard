# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2026-05-27

### Added

- GitHub Actions CI split (lint, typecheck, test, audit), staging artifact workflow, and manual production release workflow.
- npm package `atlantisboard` with Whiptail-based `atlantisboard-setup` installer and systemd unit templates.
- Fix Twemoji Assets, consolidate spritesheet and remove redundant pngs from asset bundle to reduce filesize. 

## [1.0.0] - 2026-05-27

### Added

- Initial production release pipeline, npm installer scaffolding, and deployment documentation.