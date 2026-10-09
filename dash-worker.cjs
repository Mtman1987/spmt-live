// Keep this pilot to one account and one persistent browser host.
'use strict';
process.env.CLOUD_XBOX_ALLOWED_USER_ID = require('./stream-worker-scope.cjs').DASH_USER_ID;
process.env.CLOUD_XBOX_STOP_WHEN_IDLE = 'true';
process.env.CLOUD_XBOX_IDLE_MS = '300000';
process.env.CLOUD_XBOX_PROFILE_ROOT = '/var/lib/spmt-dash/profiles';
process.env.CLOUD_XBOX_MAX_SESSIONS = '1';
process.env.SPMT_DISABLE_SAVED_PASSWORDS = 'true';
require('./xbox-worker-guard.cjs');
