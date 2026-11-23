<p align="center">
  <a href="https://quackback.io">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/readme/hero-dark.svg" />
      <img src=".github/readme/hero-light.svg" width="100%" alt="Quackback: hear what customers want. Ship it. Tell them. Feedback boards, roadmap, changelog, support inbox, help center and status page, shown with the feedback inbox." />
    </picture>
  </a>
</p>

<p align="center">
  <strong>Open-source customer feedback and support.</strong><br />
  Feedback boards, a public roadmap and changelog, a support inbox, a help center and a status page, in one product you can host yourself.
</p>

<p align="center">
  <a href="https://quackback.io">Website</a> &middot;
  <a href="https://feedback.quackback.io/hc">Docs</a> &middot;
  <a href="https://feedback.quackback.io">Our live board</a> &middot;
  <a href="#self-host">Self-host</a>
</p>

<p align="center">
  <a href="https://github.com/QuackbackIO/quackback"><img src="https://img.shields.io/github/stars/QuackbackIO/quackback?style=flat&color=f7cc29" alt="GitHub stars" /></a>
  <a href="https://github.com/QuackbackIO/quackback/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-111111" alt="License: AGPL-3.0" /></a>
  <a href="https://github.com/QuackbackIO/quackback/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/QuackbackIO/quackback/ci.yml?branch=main&label=CI" alt="CI status" /></a>
  <a href="https://github.com/QuackbackIO/quackback/releases"><img src="https://img.shields.io/github/v/release/QuackbackIO/quackback?color=111111" alt="Latest release" /></a>
</p>

## Why Quackback

- **One loop, from request to release.** Customers post and vote, you plan on a public roadmap, and when it ships, everyone who asked hears about it.
- **Support that knows what customers asked for.** Live chat, email and tickets share an inbox with your feedback, so a conversation can become a vote on a request.
- **Yours to run.** AGPL-licensed, with every feature when you self-host.

## What's inside

| Product             | What it does                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Feedback boards** | Customers post ideas, vote and comment. Similar ideas appear as they type, and duplicates merge with their votes. Statuses, tags, segments, moderation and private boards.                                         |
| **Roadmap**         | Show what's planned, in progress and complete. Link requests to Linear, GitHub, Jira and other trackers. Linear and GitHub move the request as the issue moves; other trackers send each change for your approval. |
| **Changelog**       | Publish updates and link the requests they ship, so every voter hears about it. Schedule entries, and reach subscribers by email and RSS.                                                                          |
| **Support inbox**   | Live chat, email and tickets in one shared inbox, with assignment, snoozing, macros, SLAs and office hours.                                                                                                        |
| **Help center**     | A searchable knowledge base on your own domain.                                                                                                                                                                    |
| **Status page**     | Components, incidents and maintenance windows, with email updates for subscribers.                                                                                                                                 |
| **Developers**      | A REST API with an OpenAPI spec, signed webhooks, and an [MCP server](#connect-your-ai-tools) for your own tools.                                                                                                  |

The portal speaks English, Simplified Chinese and Traditional Chinese, and follows each visitor's browser language.

## Get started

### Self-host

Every feature, unlimited seats, no license key. You run the servers, backups and upgrades, and bring your own email provider.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/quackback?referralCode=ez8Slg&utm_source=github&utm_medium=readme&utm_campaign=deploy-button)

Or run the published image with Docker Compose. It starts Quackback, PostgreSQL and S3-compatible file storage on one host:

```bash
git clone https://github.com/QuackbackIO/quackback.git
cd quackback
cp .env.prod.example .env   # fill in every value
docker compose -f docker-compose.prod.yml up -d
```

Migrations run on startup. To upgrade, back up your database and files, then:

```bash
git pull
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

- [Self-hosting guide](deploy/self-hosted/README.md): images, reverse proxy, scaling, upgrades and troubleshooting
- [Configuration reference](docs/configuration.md): the core runtime and operational variables. Optional email, storage, auth, and integration settings are documented alongside their defaults in [`.env.example`](.env.example).
- [System requirements](https://feedback.quackback.io/hc/en/articles/66-requirements) and the [Docker guide](https://feedback.quackback.io/hc/en/articles/67-docker) in our docs

## Connect your AI tools

Every instance serves an MCP server at `/api/mcp`, so agents like Claude and Cursor can search, triage and act on feedback, tickets, the changelog and help articles. Sign in with OAuth from your client:

```bash
claude mcp add --transport http quackback https://feedback.yourcompany.com/api/mcp
```

Setup for other clients is in the [MCP docs](https://feedback.quackback.io/hc/en/articles/74-mcp-server).

## Integrations

| Kind            | Tools                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Issue trackers  | Linear, GitHub, GitLab, Jira, Azure DevOps, Asana, ClickUp, Shortcut, Trello, Monday.com, Notion |
| Chat and alerts | Slack, Microsoft Teams, Discord, ntfy                                                            |
| Support and CRM | Intercom, Freshdesk, HubSpot, Salesforce, Stripe                                                 |
| Automation      | Zapier, Make, n8n, Segment, webhooks                                                             |

Each has a setup guide in the [docs](https://feedback.quackback.io/hc/en/collections/11-integrations).

## Contributing

Start with the [Contributing Guide](CONTRIBUTING.md), ask questions in [Discussions](https://github.com/QuackbackIO/quackback/discussions), and see what's being asked for on [our own board](https://feedback.quackback.io).

### Local development

You need [Bun](https://bun.sh/) 1.4 or later and [Docker](https://www.docker.com/).

```bash
git clone https://github.com/QuackbackIO/quackback.git
cd quackback
bun run setup    # install dependencies, start Postgres, file storage and Mailpit, run migrations
bun run db:seed  # optional: demo data
bun run dev      # http://localhost:3000
```

With the demo data, sign in as `demo@example.com` with the password `password`.

### Built with

[TanStack Start](https://tanstack.com/start) and [TanStack Router](https://tanstack.com/router), [PostgreSQL](https://www.postgresql.org/) with [Drizzle ORM](https://orm.drizzle.team/) (also the background job queue), [Better Auth](https://www.better-auth.com/), [Tailwind CSS](https://tailwindcss.com/) with [shadcn/ui](https://ui.shadcn.com/), and [Bun](https://bun.sh/).

<a href="https://github.com/QuackbackIO/quackback/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=QuackbackIO/quackback" alt="Contributors" />
</a>

## License

[AGPL-3.0](LICENSE). Self-hosting is free and complete. If you run a modified version as a service or distribute it, publish your changes under the AGPL. Contributions need a signed [CLA](CLA.md).
