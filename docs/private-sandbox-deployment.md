# Private sandbox deployment

This runbook deploys the existing **mock-payment** product for synthetic data and invited testers. It is not a public relief launch. It must never accept a real bill, debit a card, or claim creditor settlement.

## Required managed services

- PostgreSQL with encrypted transport, backups, and a tested restore procedure.
- Redis with encrypted transport and a private network policy.
- S3-compatible private object storage. Block public object access and allow only the API and worker credentials.
- One Linux host with Docker, a firewall, and a domain whose TLS certificate is terminated by Caddy or another managed HTTPS proxy.
- A secret manager for every value in `deploy/private-sandbox.env`; do not keep that file in source control or paste it into chat.

## Prepare the deployment

1. Copy `deploy/private-sandbox.env.example` to `deploy/private-sandbox.env` on the host and replace every placeholder with a sandbox-only secret or managed-service address.
2. Set `CORS_ALLOWED_ORIGINS` to the exact HTTPS origin of the browser preview or operator console. Comma-separated origins are allowed. Wildcards and HTTP origins are rejected in private-sandbox mode.
3. Keep `METHOD_PROVIDER=mock` and `OCR_PROVIDER=mock`. Leave every Stripe variable absent. The container will reject a loopback-only bind in private-sandbox mode.
4. Configure the host proxy from `deploy/Caddyfile.example`, point DNS at the host, and verify that port 3000 remains reachable only from loopback.

## Start and verify

From the repository root on the host:

```bash
OPEN_RELIEF_SANDBOX_ENV_FILE=deploy/private-sandbox.env docker compose --env-file deploy/private-sandbox.env -f docker-compose.sandbox.yml --profile ops run --rm migrate
OPEN_RELIEF_SANDBOX_ENV_FILE=deploy/private-sandbox.env docker compose --env-file deploy/private-sandbox.env -f docker-compose.sandbox.yml up -d api worker
curl --fail https://YOUR_SANDBOX_DOMAIN/health
curl --fail https://YOUR_SANDBOX_DOMAIN/ready
```

`/ready` returns 200 only when PostgreSQL, Redis, object storage, and an OCR worker are available. Record that check before opening an invited test session. Use synthetic bills and test accounts only.

## Operating rules

- Review container logs and `/ready` before every test session. Stop intake when readiness is not healthy.
- Keep the database, object storage, and Redis inaccessible from the public internet.
- Rotate secrets if a device, developer machine, or host is lost. Restore backups into an isolated environment before relying on them.
- Export audit logs and document a support contact for every tester. Delete synthetic accounts and documents after the trial according to the retention decision.
- The Android demo APK connects only over HTTPS. Install [RC7](https://github.com/AsteriqStudio/open-relief/releases/tag/phase11-demo-rc7) after the HTTPS readiness check succeeds.

## Prohibited changes in this deployment

Do not add live Stripe keys, live Method credentials, real bank details, public recipient intake, or donor outreach. Each would change the service from a private test environment into a financial launch and requires the evidence in [public launch readiness](public-launch-readiness.md) plus the financial approval gate.
