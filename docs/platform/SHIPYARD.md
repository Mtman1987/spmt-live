# Shipyard

Shipyard manages app lifecycle.

```mermaid
flowchart LR
  Discover --> Install --> Configure --> Enable --> Launch --> Update --> Disable --> Uninstall
```

## App Metadata

Every app should provide:

- id
- name
- description
- launch URL
- auth URL
- version
- latest version
- health status
- permissions
- install state
