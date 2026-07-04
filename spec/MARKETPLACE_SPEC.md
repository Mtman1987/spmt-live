# Marketplace Specification

## Principle

Shipyard should eventually manage more than apps.

Installable ecosystem items may include:

- apps
- plugins
- themes
- widgets
- automation packs
- Athena skills
- community packs
- extensions

## Required Marketplace Metadata

```ts
type MarketplaceItem = {
  id: string;
  type: "app" | "plugin" | "theme" | "widget" | "automation" | "athena_skill" | "community_pack" | "extension";
  name: string;
  author: string;
  description: string;
  version: string;
  permissions: string[];
  screenshots?: string[];
  rating?: number;
  downloads?: number;
  compatibility?: string[];
};
```

## Rules

- Marketplace items must declare permissions.
- Official items should be clearly labeled.
- Beta and experimental items should be clearly labeled.
- Installation should be reversible where practical.
