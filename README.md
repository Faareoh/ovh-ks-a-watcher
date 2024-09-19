A very simple script to watch KS-A server on OVH

## Requirements
- docker or bun

## install
create a .env file with the following content:
```
DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/..."
DISCORD_OWNER_ID = "1234567890" # your discord id, optional
```

then run the following command:
```bash
docker compose up -d
```

or 
```bash
bun install
bun start 
```