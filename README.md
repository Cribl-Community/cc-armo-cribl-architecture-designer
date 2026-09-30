# ArMo - Cribl Architecture Designer

Design, size, and plan a Cribl deployment in minutes — from inside Cribl, grounded in Cribl's published sizing guidance and your live workspace.

## Summary

ArMo - Cribl Architecture Designer is a Cribl App for pre-sales engineers, partners, and platform owners. It turns a list of data sources and destinations into a defensible Cribl architecture: an interactive diagram, Worker Group and Worker Node sizing with every calculation shown, design decisions with their reasoning, a dependency-scheduled deployment plan, and a preview of the Cribl configuration to build it.

## What This App Does

* Primary purpose: go from "what data do you have?" to a sized, explained, and scheduled Cribl architecture.
* Key capabilities:
  * Seven-step guided designer: deployment mode, sources & destinations with per-source routing, architecture drivers, features & Persistent Queues, architecture, deployment plan, build in Cribl.
  * Sizing from Cribl guidance: 200 GB/day per x86 vCPU (480 per ARM/Graviton vCPU) in + out, reserved vCPUs per node, HA that survives 20% of Worker Nodes down, at least 3 Worker Nodes per production Worker Group, per-group sizing, processing-complexity headroom.
  * Interactive architecture diagram: Leader, Worker Groups, Edge Fleets, load balancers, Syslog and cloud collection, destinations — with real product logos and correct ports (Cribl TCP 10300, Syslog 9514, 4200 control plane).
  * Persistent Queue disk sizing for a chosen outage window.
  * Cribl.Cloud-aware: Cribl-managed Worker Group sizing tiers, Hybrid and On-Prem topologies, Leader HA.
  * Deployment plan with 12 workstreams, parallel scheduling, critical path, party assignment, progress tracking, Markdown/PDF export.
  * Import from this workspace: reads your Worker Groups, Worker Nodes, Sources, Destinations, and license usage to pre-fill a design.
  * Cribl Config Preview: the Worker Group, Source, Destination, Route, and Fleet payloads the design needs.
* Intended users: Pre-sales / Solutions Engineers, Partners, Platform owners, Cribl admins.
* Works with: Stream, Edge, Lake, Search, Cribl.Cloud, Hybrid.

## When To Use This App

* Scoping a new Cribl deployment or POC with a customer.
* Re-sizing an existing workspace before onboarding new sources.
* Producing a deployment plan and bill of materials for a project kickoff.

## Before You Install

* Required Cribl product or deployment type: Cribl.Cloud (Apps platform).
* Required permissions or roles: App user. "Import from this workspace" additionally needs read access to Worker Groups, Worker Nodes, Sources, Destinations, and license usage; without it the designer still works with manual input.
* Required external systems or APIs: none.
* Required configuration values: none.

## Installation

### Install From Marketplace or URL
1. Go to Apps in your Cribl environment.
2. Choose the Marketplace or import from URL option.
3. Review the app details and complete installation.

### If The App Is Not Yet In The Cribl Marketplace
1. Download the `.tgz` app package: [`build/cribl-architecture-designer-1.0.2.tgz`](build/cribl-architecture-designer-1.0.2.tgz) in this repository.
2. In Cribl, go to Apps and choose import from file.
3. Upload the `.tgz` file and complete installation.

## Configuration

No configuration is required. A sample design is created on first run so the app is explorable immediately.

## How To Use

### Typical Workflow
1. Open the app from the Apps page and choose **New design** (or **Start from sample**).
2. Pick POC or Production, then add source groups and destinations and map which source goes where — or **Import from workspace**.
3. Set the architecture drivers: Worker Group strategy, CPU architecture, node size, deployment model, peak factor, filtering.
4. Choose features and Persistent Queue behavior.
5. Review the architecture diagram, sizing, decisions, and warnings.
6. Schedule the deployment plan, assign parties, track progress, and export it.
7. Preview the Cribl configuration to build it.

## Permissions

The app only reads Cribl configuration. It never writes to Cribl configuration.

### Cribl API Endpoints Used

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/master/groups` | List Worker Groups and Edge Fleets for import |
| GET | `/api/v1/master/workers` | Count Worker Nodes and vCPUs per group for import |
| GET | `/api/v1/system/licenses/usage` | Average daily inbound/outbound volume for import |
| GET | `/api/v1/m/{groupId}/system/inputs` | Discover Sources per Worker Group for import |
| GET | `/api/v1/m/{groupId}/system/outputs` | Discover Destinations per Worker Group for import |
| GET/PUT/DELETE | `/api/v1/a/{appId}/kvstore/designs/...` | Save, load, and delete your designs (app-scoped KV) |

If a call is denied, the import shows which data could not be read and continues with what it could.

## External API Access

The app makes no external calls. `proxies.yml` declares no domains.

## Data And Storage

* Designs are stored in the app's KV store under `designs/{userId}/…` (one key per design plus an index).
* Designs are per user and per Workspace.
* Deleting the app deletes its KV data.

## Support

### Community Built
Built for the Cribl App Hackathon by Arno Arzumanyan. Contact the maintainer via the app's repository.

## Known Limitations

* Sizing is a planning estimate; validate with real data and Cribl's Sizing Calculator for Cribl-managed groups.
* Import volume per source is estimated from license usage and should be reviewed.
* "Apply to workspace" is preview-only in this version.

## Demo Video

[`media/ArMo-prototype-v3.mp4`](media/ArMo-prototype-v3.mp4) — work-in-progress Cribl Conference 2026 Hackathon film (opening through DESIGN, 53 s).

## Development

```bash
npm install
npm run dev
npm run package
```

Outside Cribl the app runs in local demo mode (in-memory storage, sample workspace for import).

## License

Licensed under the [Apache License, Version 2.0](LICENSE).

## App Metadata

| Field | Value |
|---|---|
| App Name | ArMo - Cribl Architecture Designer |
| App ID | cribl-architecture-designer |
| Version | 1.0.2 |
| Author | Arno Arzumanyan |
| Support Model | community-built |
| Support Label | Community Built |
| Support Contact | App repository |
| License | Apache-2.0 |
| License File | [LICENSE](LICENSE) |
| Product Tags | stream, edge, lake, search |
| Category | Architecture & Planning |
| Audience | builder, platform-owner, admin |
| Availability | preview |
| Requires External Access | no |
| Repository | https://github.com/Cribl-Community/cc-armo-cribl-architecture-designer |
| Documentation | |
| README Schema Version | 1.0 |
