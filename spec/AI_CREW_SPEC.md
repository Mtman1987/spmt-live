# AI Crew Specification

## Principle

Athena can coordinate with other AI crew members.

Athena is the command intelligence. Other AI may specialize.

## AI Crew Shape

```ts
type AiCrewMember = {
  id: string;
  name: string;
  role: string;
  personality: string;
  capabilities: string[];
  permissions: string[];
  visibility: "private" | "crew" | "public";
  memoryScopes: string[];
};
```

## Example Crew Roles

- Athena: operating intelligence and command routing
- Scarlett: community and social strategy
- Moonbeam: voice, rooms, music, and emotional tone
- Forge: automation and developer workflows
- Atlas: app awareness and ecosystem mapping

## Rules

- Athena routes work to crew when specialization helps.
- Crew members must respect permissions.
- Crew responses should identify source context.
- Crew should not invent access to apps or data.
- Memory ownership must be explicit.
