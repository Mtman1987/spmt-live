import { SpaceMountainClient } from '@spmt/sdk';

const spmt = new SpaceMountainClient({
  apiKey: process.env.SPMT_API_KEY,
  appId: 'atherrea',
  baseUrl: process.env.SPMT_BASE_URL || 'https://spmt.live',
});

const result = await spmt.game.publish('session.started', {
  sessionId: 'atherrea-proof-001',
  playerCount: 1,
  summary: 'Atherrea proof session started',
});

console.log(result.event);
