# App Specification

## Principle

An ecosystem app is a specialized module connected through SPMT.

## Required App Metadata

```ts
type EcosystemApp = {
  id: string;
  name: string;
  description: string;
  category: string;
  launchUrl: string;
  authUrl?: string;
  healthUrl?: string;
  iconUrl?: string;
  version: string;
  latestVersion?: string;
  status: "connected" | "available" | "adapter-needed" | "planned" | "disabled" | "broken";
  official: boolean;
  permissions: string[];
};
```

## Required App Capabilities

Each app should support:

- SPMT identity
- launch URL
- health/version metadata
- event publishing
- Commlink notifications for important events
- Athena context where useful
- install/enable/disable state through Shipyard

## Rules

- Apps own app-specific features.
- Apps do not own global identity.
- Apps do not own global notifications.
- Apps do not own the global app registry.
- Apps should not assume they are always iframe-embedded.
- Apps should support top-level launch.
