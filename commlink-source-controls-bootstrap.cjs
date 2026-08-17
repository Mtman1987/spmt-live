'use strict';

const fs = require('node:fs');
const path = require('node:path');

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) {
    const complete = source.includes("const member = $('[data-space-source=\"' + CSS.escape(input.dataset.bridgeSource) + '\"]');");
    if (complete) return source;
    throw new Error(`Commlink source controls bootstrap could not find ${label}`);
  }
  return source.replace(from, to);
}

function replaceAllRequired(source, from, to, label) {
  if (source.includes(to) && !source.includes(from)) return source;
  if (!source.includes(from)) throw new Error(`Commlink source controls bootstrap could not find ${label}`);
  return source.replaceAll(from, to);
}

function installCommlinkSourceControlsBootstrap() {
  const jsPath = process.env.SPMT_COMMLINK_JS_PATH
    ? path.resolve(process.env.SPMT_COMMLINK_JS_PATH)
    : path.join(__dirname, 'public', 'commlink', 'commlink.js');
  const cssPath = process.env.SPMT_COMMLINK_CSS_PATH
    ? path.resolve(process.env.SPMT_COMMLINK_CSS_PATH)
    : path.join(__dirname, 'public', 'commlink', 'commlink.css');

  let source = fs.readFileSync(jsPath, 'utf8');
  if (!source.includes('function friendlyChannelName(')) {
    throw new Error('Commlink source controls bootstrap requires the rich-chat bootstrap to run first');
  }

  const oldActiveSources = `const activeSources = () => {
  const space = state.chatSpaces.find((item) => item.id === state.activeSpace) || state.chatSpaces[0];
  const selected = state.sources.filter((source) => space.sources.includes(source.id));
  return selected.length || state.feedMode === 'synthetic' ? selected : state.sources;
};`;
  const newActiveSources = `const DEFAULT_PRESENTATION_CATEGORIES = ['chat', 'activity', 'notification'];
const VALID_PRESENTATION_CATEGORIES = ['chat', 'activity', 'notification', 'diagnostic'];

function normalizedSpace(space, legacySchema = 4) {
  const next = space || {};
  const legacySources = Array.isArray(next.sources) ? next.sources : [];
  return {
    ...next,
    sources: legacySources,
    sourceMode: next.sourceMode === 'custom' || next.sourceMode === 'all'
      ? next.sourceMode
      : (legacySchema < 4 && legacySources.length ? 'custom' : 'all'),
    presentationCategories: Array.isArray(next.presentationCategories)
      ? next.presentationCategories.filter((category) => VALID_PRESENTATION_CATEGORIES.includes(category))
      : [...DEFAULT_PRESENTATION_CATEGORIES],
  };
}

function activeSpaceRecord() {
  return normalizedSpace(state.chatSpaces.find((item) => item.id === state.activeSpace) || state.chatSpaces[0]);
}

const activeSources = () => {
  const space = activeSpaceRecord();
  if (state.feedMode !== 'synthetic' && space.sourceMode === 'all') return [...state.sources];
  return state.sources.filter((source) => space.sources.includes(source.id));
};

function messageBelongsToSpace(message, space, sourceIds, aggregateProviders, hiddenSourceIds = null) {
  if (hiddenSourceIds?.has(message.sourceId)) return false;
  if (state.feedMode === 'synthetic' && state.activeSpace === 'friday') return true;
  if (state.feedMode !== 'synthetic' && space.sourceMode === 'all') return true;
  return sourceIds.has(message.sourceId) || aggregateProviders.has(message.provider);
}

function messageCategoryVisible(message, space) {
  const categories = new Set(Array.isArray(space.presentationCategories) ? space.presentationCategories : DEFAULT_PRESENTATION_CATEGORIES);
  return categories.has(message.presentationCategory || (message.kind === 'chat' ? 'chat' : 'activity'));
}`;
  source = replaceRequired(source, oldActiveSources, newActiveSources, 'active source selection');

  source = replaceRequired(
    source,
    `function renderMessages() {
  const sourceIds = new Set(activeSources().map((source) => source.id));
  const aggregateProviders = new Set(activeSources().filter((source) => source.aggregate).map((source) => source.provider));
  const visible = state.messages.filter((message) => {
    const belongs = sourceIds.has(message.sourceId) || aggregateProviders.has(message.provider) || message.provider === 'spmt';
    if (!belongs && state.feedMode !== 'synthetic') return false;
    if (!belongs && state.activeSpace !== 'friday') return false;`,
    `function renderMessages() {
  const space = activeSpaceRecord();
  const active = activeSources();
  const sourceIds = new Set(active.map((source) => source.id));
  const aggregateProviders = new Set(active.filter((source) => source.aggregate).map((source) => source.provider));
  const visible = state.messages.filter((message) => {
    const belongs = messageBelongsToSpace(message, space, sourceIds, aggregateProviders);
    if (!belongs) return false;
    if (!messageCategoryVisible(message, space)) return false;`,
    'message visibility rules',
  );

  source = replaceRequired(
    source,
    `  const deskSourceIds = new Set(panels.flatMap((panel) => state.chatSpaces.find((space) => space.id === panel.chatSpaceId)?.sources || []));`,
    `  const deskSourceIds = new Set(panels.flatMap((panel) => {
    const space = state.chatSpaces.find((entry) => entry.id === panel.chatSpaceId);
    const normalized = normalizedSpace(space);
    return state.feedMode !== 'synthetic' && normalized.sourceMode === 'all'
      ? state.sources.map((source) => source.id)
      : normalized.sources;
  }));`,
    'desk source tabs',
  );

  source = replaceRequired(
    source,
    `    const sourceIds = new Set(space.sources.filter((id) => !hidden.has(id)));
    const aggregateProviders = new Set(state.sources
      .filter((source) => source.aggregate && sourceIds.has(source.id))
      .map((source) => source.provider));
    const visibleMessages = state.messages.filter((message) => (
      sourceIds.has(message.sourceId)
      || aggregateProviders.has(message.provider)
      || (message.provider === 'spmt' && sourceIds.has('spmt-direct'))
    )).slice(-30);`,
    `    const normalized = normalizedSpace(space);
    const sourceIds = new Set((state.feedMode !== 'synthetic' && normalized.sourceMode === 'all'
      ? state.sources.map((source) => source.id)
      : normalized.sources).filter((id) => !hidden.has(id)));
    const aggregateProviders = new Set(state.sources
      .filter((source) => source.aggregate && sourceIds.has(source.id))
      .map((source) => source.provider));
    const visibleMessages = state.messages.filter((message) => (
      messageBelongsToSpace(message, normalized, sourceIds, aggregateProviders, hidden)
      && messageCategoryVisible(message, normalized)
    )).slice(-30);`,
    'desk message visibility rules',
  );

  source = replaceRequired(
    source,
    `    sourceId: \`${'${provider}:${item.channelId}'}\`,`,
    `    sourceId: String(item.sourceId || \`${'${provider}:${item.channelId || \'unknown\'}'}\`),`,
    'canonical message source id',
  );
  source = replaceRequired(
    source,
    `    channel: friendlyChannelName(provider, item.channelName || item.sourceName || item.channelId || 'unknown'),`,
    `    channel: friendlyChannelName(provider, item.channelName || item.sourceName || 'Unknown channel'),`,
    'human message channel label',
  );
  source = replaceRequired(
    source,
    `    media,
    streamweaver: item.meta?.streamweaver && typeof item.meta.streamweaver === 'object' ? item.meta.streamweaver : null,`,
    `    media,
    presentationCategory: VALID_PRESENTATION_CATEGORIES.includes(item.presentation?.category) ? item.presentation.category : (isChat ? 'chat' : 'activity'),
    streamweaver: item.meta?.streamweaver && typeof item.meta.streamweaver === 'object' ? item.meta.streamweaver : null,`,
    'message presentation category',
  );

  source = replaceRequired(
    source,
    `      id: \`${'${provider}:${channel.channelId}'}\`,
      provider,
      channel: friendlyChannelName(provider, channel.channelName || channel.sourceName || channel.channelId),`,
    `      id: String(channel.sourceId || \`${'${provider}:${channel.channelId || \'unknown\'}'}\`),
      provider,
      channel: friendlyChannelName(provider, channel.channelName || channel.displayName || channel.sourceName || 'Unknown channel'),
      sourceName: String(channel.sourceName || providerFor(provider).name),
      guildId: String(channel.guildId || ''),
      guildName: String(channel.guildName || ''),
      categoryId: String(channel.categoryId || ''),
      categoryName: String(channel.categoryName || ''),`,
    'canonical channel source identity',
  );

  const uniqueMarker = `  const unique = Array.from(new Map(channelSources.map((source) => [source.id, source])).values());`;
  const uniqueReplacement = `  const retainedIds = new Set(state.chatSpaces.flatMap((space) => [
    ...(space.sources || []),
    ...(space.selectedDestinationIds || []),
    ...(space.bridgeSourceIds || []),
  ]));
  const eventSources = (Array.isArray(payload.items) ? payload.items : []).map((item) => {
    const provider = canonicalProvider(item);
    const sourceId = String(item.sourceId || \`${'${provider}:${item.channelId || \'unknown\'}'}\`);
    const health = healthByProvider.get(item.platform) || healthByProvider.get(provider) || {};
    return {
      id: sourceId,
      provider,
      channel: friendlyChannelName(provider, item.channelName || item.sourceName || 'Unknown channel'),
      channelId: String(item.channelId || ''),
      sourceName: String(item.sourceName || providerFor(provider).name),
      guildId: String(item.meta?.discord?.guildId || ''),
      guildName: String(item.meta?.discord?.guildName || ''),
      categoryId: String(item.meta?.discord?.categoryId || ''),
      categoryName: String(item.meta?.discord?.categoryName || ''),
      capabilities: { compose: false, reply: Boolean(item.routing?.canReply), timeout: false, delete: false },
      state: \`${'${String(health.status || \'recent\')}'} · ${'${provider === \'spmt\' ? \'app activity\' : \'read only\'}'}\`,
      health: health.status || 'recent',
      readOnly: true,
      eventBacked: true,
    };
  });
  const retainedEventSources = state.sources.filter((source) => source.eventBacked && retainedIds.has(source.id));
  const uniqueById = new Map([...retainedEventSources, ...eventSources].map((source) => [source.id, source]));
  channelSources.forEach((channelSource) => {
    const eventSource = uniqueById.get(channelSource.id);
    uniqueById.set(channelSource.id, {
      ...(eventSource || {}),
      ...channelSource,
      guildId: channelSource.guildId || eventSource?.guildId || '',
      guildName: channelSource.guildName || eventSource?.guildName || '',
      categoryId: channelSource.categoryId || eventSource?.categoryId || '',
      categoryName: channelSource.categoryName || eventSource?.categoryName || '',
      capabilities: channelSource.capabilities,
      state: channelSource.state,
      readOnly: channelSource.readOnly,
      eventBacked: false,
    });
  });
  const unique = Array.from(uniqueById.values());`;
  source = replaceRequired(source, uniqueMarker, uniqueReplacement, 'event-backed source discovery');

  source = replaceRequired(
    source,
    `  const params = new URLSearchParams({ limit: query ? '100' : '200' });`,
    `  const params = new URLSearchParams({ limit: query ? '100' : '200' });
  const categories = activeSpaceRecord().presentationCategories;
  if (categories.length) params.set('categories', categories.join(','));`,
    'presentation category feed request',
  );

  source = replaceAllRequired(source, 'schemaVersion: 3,', 'schemaVersion: 4,', 'workspace schema version');
  source = replaceRequired(
    source,
    `      sources: [...space.sources],
      selectedDestinationIds:`,
    `      sources: [...space.sources],
      sourceMode: normalizedSpace(space).sourceMode,
      presentationCategories: [...normalizedSpace(space).presentationCategories],
      selectedDestinationIds:`,
    'workspace v4 source preferences',
  );
  source = replaceRequired(
    source,
    `  if ([1, 2, 3].includes(data?.schemaVersion) && Array.isArray(data.chatSpaces) && data.chatSpaces.length) {`,
    `  if ([1, 2, 3, 4].includes(data?.schemaVersion) && Array.isArray(data.chatSpaces) && data.chatSpaces.length) {`,
    'workspace schema acceptance',
  );
  source = replaceRequired(
    source,
    `    if (validSpaces.length) state.chatSpaces = validSpaces;`,
    `    if (validSpaces.length) state.chatSpaces = validSpaces.map((space) => normalizedSpace(space, Number(data.schemaVersion || 1)));`,
    'workspace schema migration',
  );
  source = replaceRequired(
    source,
    `    sources: [],
    selectedDestinationIds: [],`,
    `    sources: [],
    sourceMode: 'all',
    presentationCategories: [...DEFAULT_PRESENTATION_CATEGORIES],
    selectedDestinationIds: [],`,
    'new ChatSpace source defaults',
  );

  const oldEditor = `  if (isSpace) {
    const members = new Set(item.sources || []);
    const bridged = new Set(item.bridgeSourceIds || []);
    $('#workspace-source-editor').innerHTML = state.sources.map((source) => {
      const provider = providerFor(source.provider);
      return \`<div class="workspace-source-row" style="${'${providerStyle(source.provider)}'}">
        <span class="provider-logo">${'${provider.short}'}</span>
        <span><strong>${'${provider.name}'} · ${'${escapeHtml(source.channel)}'}</strong><small>${'${escapeHtml(source.state)}'}</small></span>
        <label><input type="checkbox" data-space-source="${'${source.id}'}" ${'${members.has(source.id) ? \'checked\' : \'\'}'}> In ChatSpace</label>
        <label><input type="checkbox" data-bridge-source="${'${source.id}'}" ${'${bridged.has(source.id) ? \'checked\' : \'\'}'} ${'${members.has(source.id) ? \'\' : \'disabled\'}'}> Bridge</label>
      </div>\`;
    }).join('') + \`<a class="secondary-button full-button link-button" href="/?view=connections" target="_top">Open the SPMT Connections hub</a>\`;
  } else {`;
  const newEditor = `  if (isSpace) {
    const normalized = normalizedSpace(item);
    const members = new Set(normalized.sources || []);
    const bridged = new Set(normalized.bridgeSourceIds || []);
    const categories = new Set(normalized.presentationCategories || DEFAULT_PRESENTATION_CATEGORIES);
    const sourceGroups = new Map();
    state.sources.forEach((source) => {
      const provider = providerFor(source.provider);
      const providerLabel = source.provider === 'spmt' ? 'SPMT apps' : provider.name;
      const location = source.provider === 'discord'
        ? [source.guildName || 'Discord', source.categoryName || 'Channels'].join(' · ')
        : providerLabel;
      if (!sourceGroups.has(location)) sourceGroups.set(location, []);
      sourceGroups.get(location).push(source);
    });
    const labels = { chat: 'Chat', activity: 'Activity', notification: 'Notifications', diagnostic: 'Diagnostics' };
    const categoryControls = VALID_PRESENTATION_CATEGORIES.map((category) => {
      const help = category === 'diagnostic' ? 'Internal delivery/debug events (off by default)' : 'User-facing feed events';
      return '<label class="workspace-category-row"><input type="checkbox" data-presentation-category="' + escapeHtml(category) + '" ' + (categories.has(category) ? 'checked' : '') + '><span><strong>' + escapeHtml(labels[category]) + '</strong><small>' + escapeHtml(help) + '</small></span></label>';
    }).join('');
    const groupedSources = Array.from(sourceGroups.entries()).map(([label, sources]) => {
      const rows = sources.sort((a, b) => String(a.channel).localeCompare(String(b.channel))).map((source) => {
        const provider = providerFor(source.provider);
        const channelLabel = source.provider === 'discord' ? '#' + String(source.channel).replace(/^#/, '') : source.channel;
        return '<div class="workspace-source-row" style="' + providerStyle(source.provider) + '">' +
          '<span class="provider-logo">' + escapeHtml(provider.short) + '</span>' +
          '<span><strong>' + escapeHtml(channelLabel) + '</strong><small>' + escapeHtml(source.sourceName || source.state) + '</small></span>' +
          '<label><input type="checkbox" data-space-source="' + escapeHtml(source.id) + '" ' + (members.has(source.id) ? 'checked' : '') + ' ' + (normalized.sourceMode === 'all' ? 'disabled' : '') + '> Show</label>' +
          '<label><input type="checkbox" data-bridge-source="' + escapeHtml(source.id) + '" ' + (bridged.has(source.id) ? 'checked' : '') + ' ' + (members.has(source.id) && normalized.sourceMode !== 'all' ? '' : 'disabled') + '> Bridge</label>' +
        '</div>';
      }).join('');
      return '<section class="workspace-source-group"><h3>' + escapeHtml(label) + '</h3>' + rows + '</section>';
    }).join('');
    $('#workspace-source-editor').innerHTML =
      '<div class="workspace-source-mode">' +
        '<label><input type="radio" name="workspace-source-mode" value="all" ' + (normalized.sourceMode === 'all' ? 'checked' : '') + '> Everything from every connected source</label>' +
        '<label><input type="radio" name="workspace-source-mode" value="custom" ' + (normalized.sourceMode === 'custom' ? 'checked' : '') + '> Only selected sources</label>' +
      '</div>' +
      '<div class="workspace-category-grid">' + categoryControls + '</div>' +
      (groupedSources || '<div class="feed-empty">No connected sources have reported activity yet.</div>') +
      '<a class="secondary-button full-button link-button" href="/?view=connections" target="_top">Open the SPMT Connections hub</a>';
  } else {`;
  source = replaceRequired(source, oldEditor, newEditor, 'hierarchical source picker');

  source = replaceRequired(
    source,
    `    const sources = $$('[data-space-source]:checked').map((input) => input.dataset.spaceSource);
    const sourceSet = new Set(sources);
    space.name = name;
    space.sources = sources;`,
    `    const sourceMode = $('[name="workspace-source-mode"]:checked')?.value === 'custom' ? 'custom' : 'all';
    const sources = $$('[data-space-source]:checked').map((input) => input.dataset.spaceSource);
    const sourceSet = new Set(sources);
    const allowedSourceIds = sourceMode === 'all' ? new Set(state.sources.map((source) => source.id)) : sourceSet;
    const presentationCategories = $$('[data-presentation-category]:checked').map((input) => input.dataset.presentationCategory);
    space.name = name;
    space.sourceMode = sourceMode;
    space.presentationCategories = presentationCategories;
    space.sources = sources;`,
    'source preference save',
  );
  source = replaceRequired(
    source,
    `    space.selectedDestinationIds = (space.selectedDestinationIds || []).filter((id) => sourceSet.has(id));`,
    `    space.selectedDestinationIds = (space.selectedDestinationIds || []).filter((id) => allowedSourceIds.has(id));`,
    'destination preservation for all mode',
  );
  source = replaceRequired(
    source,
    `    if (space.id === state.activeSpace) state.selectedDestinations = [...space.selectedDestinationIds];`,
    `    if (space.id === state.activeSpace) {
      state.selectedDestinations = [...space.selectedDestinationIds];
      if (!demoMode) loadCommlinkFeed();
    }`,
    'active source preference refresh',
  );

  const oldSourcePickerListener = [
    "  $('#workspace-source-editor').addEventListener('change', (event) => {",
    "    if (!event.target.matches('[data-space-source]')) return;",
    "    const bridge = $(`[data-bridge-source=\"${CSS.escape(event.target.dataset.spaceSource)}\"]`);",
    "    bridge.disabled = !event.target.checked;",
    "    if (!event.target.checked) bridge.checked = false;",
    "  });",
  ].join('\n');
  const newSourcePickerListener = [
    "  $('#workspace-source-editor').addEventListener('change', (event) => {",
    "    if (event.target.matches('[name=\"workspace-source-mode\"]')) {",
    "      const custom = event.target.value === 'custom';",
    "      $$('[data-space-source]').forEach((input) => { input.disabled = !custom; });",
    "      $$('[data-bridge-source]').forEach((input) => {",
    "        const member = $('[data-space-source=\"' + CSS.escape(input.dataset.bridgeSource) + '\"]');",
    "        input.disabled = !custom || !member?.checked;",
    "      });",
    "      return;",
    "    }",
    "    if (!event.target.matches('[data-space-source]')) return;",
    "    const bridge = $('[data-bridge-source=\"' + CSS.escape(event.target.dataset.spaceSource) + '\"]');",
    "    bridge.disabled = !event.target.checked;",
    "    if (!event.target.checked) bridge.checked = false;",
    "  });",
  ].join('\n');
  source = replaceRequired(source, oldSourcePickerListener, newSourcePickerListener, 'source picker mode interactions');

  fs.writeFileSync(jsPath, source, 'utf8');

  let css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('.workspace-source-mode')) {
    css += `\n\n/* Commlink v4 source controls: human-readable grouped sources and explicit diagnostics. */\n.workspace-source-mode { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: rgba(255,255,255,.025); }\n.workspace-source-mode label { display: flex; align-items: center; gap: 7px; font-size: 9px; color: var(--text); }\n.workspace-category-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 7px; }\n.workspace-category-row { display: grid; grid-template-columns: auto minmax(0,1fr); align-items: start; gap: 7px; padding: 8px; border: 1px solid var(--border); border-radius: 9px; background: rgba(255,255,255,.02); }\n.workspace-category-row strong, .workspace-category-row small { display: block; }\n.workspace-category-row strong { font-size: 9px; }\n.workspace-category-row small { margin-top: 2px; color: var(--muted); font-size: 7px; }\n.workspace-source-group { display: grid; gap: 6px; }\n.workspace-source-group h3 { margin: 6px 2px 0; color: var(--muted); font-size: 8px; letter-spacing: .08em; text-transform: uppercase; }\n@media (max-width: 620px) { .workspace-category-grid { grid-template-columns: 1fr; } }\n`;
    fs.writeFileSync(cssPath, css, 'utf8');
  }
}

module.exports = { installCommlinkSourceControlsBootstrap };
