/* Installed inside commlink.js before initialization. Visibility never selects
 * recipients. Aggregate feeds are reading views, never sending destinations. */
(() => {
  const nav = { open: new Set(), search: '', recipient: null, personal: false, review: null, contacts: new Map(), conversations: new Map() };
  const realChats = () => state.sources.filter(source => !source.aggregate && !source.id.endsWith(':status'));
  const providerName = source => source.provider === 'spmt' ? 'SPMT messages & activity' : providerFor(source.provider).name;
  const label = source => {
    if (source.provider === 'spmt') return nav.conversations.get(source.channelId) || (/^(direct|conversation|unknown)$/i.test(source.channel) ? 'Personal inbox' : source.channel);
    return source.channel || 'Unnamed chat';
  };
  const serverName = source => source.guildName || (source.guildId ? `Server ${source.guildId}` : 'Server name unavailable');
  const fullLabel = source => [providerName(source), ...(source.provider === 'discord' ? [serverName(source), source.parentName].filter(Boolean) : []), label(source)].join(' / ');
  const visibleIn = (source, space) => !(space.hiddenSourceIds || []).includes(source.id)
    && (space.sourceMode === 'all' || space.sources.includes(source.id)
      || state.sources.some(item => item.aggregate && item.provider === source.provider && space.sources.includes(item.id)));
  const exactWritable = source => source && !source.aggregate && source.channelId && source.capabilities?.compose && !source.id.endsWith(':status');
  const canReply = source => source && !source.aggregate && source.channelId && source.capabilities?.reply;
  const escape = escapeHtml;

  function grouped(chats, row) {
    const providers = new Map();
    for (const source of chats) {
      if (!providers.has(source.provider)) providers.set(source.provider, []);
      providers.get(source.provider).push(source);
    }
    return [...providers].sort(([a], [b]) => providerName({ provider: a }).localeCompare(providerName({ provider: b }))).map(([provider, sources]) => {
      const key = `platform:${provider}`;
      let rows;
      if (provider === 'discord') {
        const servers = new Map();
        for (const source of sources) {
          const id = source.guildId || source.guildName || 'unknown';
          if (!servers.has(id)) servers.set(id, []);
          servers.get(id).push(source);
        }
        rows = [...servers].sort((a, b) => serverName(a[1][0]).localeCompare(serverName(b[1][0]))).map(([id, channels]) => {
          const serverKey = `server:${id}`;
          const categories = new Map();
          for (const channel of channels) {
            const category = channel.parentName || 'Channels';
            if (!categories.has(category)) categories.set(category, []);
            categories.get(category).push(channel);
          }
          return `<details class="chat-server" data-chat-group="${escape(serverKey)}" ${nav.search || nav.open.has(serverKey) ? 'open' : ''}><summary>${escape(serverName(channels[0]))}<small>${channels.length}</small></summary>${[...categories].sort(([a], [b]) => a.localeCompare(b)).map(([category, entries]) => `<div class="chat-category"><h4>${escape(category)}</h4>${entries.sort((a, b) => label(a).localeCompare(label(b))).map(row).join('')}</div>`).join('')}</details>`;
        }).join('');
      } else rows = sources.sort((a, b) => label(a).localeCompare(label(b))).map(row).join('');
      return `<details class="chat-platform" data-chat-group="${escape(key)}" ${nav.search || nav.open.has(key) ? 'open' : ''}><summary>${escape(providerName(sources[0]))}<small>${sources.length} chat${sources.length === 1 ? '' : 's'}</small></summary>${rows}</details>`;
    }).join('');
  }

  function preserveGroups(container) {
    container.querySelectorAll('[data-chat-group]').forEach(group => group.addEventListener('toggle', () => {
      if (nav.search) return;
      if (group.open) nav.open.add(group.dataset.chatGroup); else nav.open.delete(group.dataset.chatGroup);
    }));
  }

  const normalizeBefore = normalizeFeedItem;
  normalizeFeedItem = item => {
    const message = normalizeBefore(item);
    if (item.meta?.publicCommunityChat) { message.capabilities.moderate = false; message.capabilities.reply = false; }
    return message;
  };

  const belongsBefore = messageBelongsToSpace;
  messageBelongsToSpace = (message, space, ...args) => !(space.hiddenSourceIds || []).includes(message.sourceId) && belongsBefore(message, space, ...args);
  const workspaceBefore = currentWorkspaceData;
  currentWorkspaceData = () => {
    const data = workspaceBefore();
    data.chatSpaces.forEach(space => {
      space.hiddenSourceIds = [...(state.chatSpaces.find(item => item.id === space.id)?.hiddenSourceIds || [])];
      // Recipients must be explicitly chosen for this session, never restored en masse.
      space.selectedDestinationIds = [];
    });
    return data;
  };
  const applyBefore = applyWorkspaceRecord;
  applyWorkspaceRecord = (...args) => {
    const chosen = state.selectedDestinations.length === 1 ? state.selectedDestinations[0] : null;
    const replyId = state.replyToMessageId;
    applyBefore(...args);
    // Loading never imports recipients from saved data. A save response also
    // must not discard the recipient the user explicitly chose in this session.
    const source = state.sources.find(item => item.id === chosen);
    state.selectedDestinations = (replyId ? canReply(source) : exactWritable(source)) ? [chosen] : [];
    state.replyToMessageId = state.selectedDestinations.length ? replyId : null;
  };
  const rememberBefore = rememberSpaceDestinations;
  rememberSpaceDestinations = () => {
    rememberBefore();
    const space = state.chatSpaces.find(item => item.id === state.activeSpace);
    if (space) space.selectedDestinationIds = [];
  };

  renderSourceChips = () => {
    const chats = realChats();
    const space = activeSpaceRecord();
    $('#source-count').textContent = `${chats.filter(source => visibleIn(source, space)).length} of ${chats.length} chats shown`;
    const unavailable = state.sourceHealth.filter(source => source.status === 'unavailable').map(source => providerFor(source.platform).name);
    $('#source-health-summary').textContent = unavailable.length ? `Connection unavailable: ${unavailable.join(', ')}` : '';
    const host = $('#source-chips');
    if (!host.querySelector('#chat-browser')) {
      host.innerHTML = '<details id="chat-browser"><summary>Choose chats <small>Show or hide in your feed</small></summary><div class="chat-browser-body"><label for="chat-search">Find a chat or Discord server</label><input id="chat-search" type="search" placeholder="Search chats…" autocomplete="off"><div class="chat-bulk"><button type="button" id="chat-show-all">Show all chats</button><button type="button" id="chat-hide-all">Hide all chats</button></div><p class="chat-help">These switches only change what you read.</p><div id="chat-groups"></div></div></details>';
      $('#chat-search').addEventListener('input', event => { nav.search = event.target.value.toLowerCase().trim(); renderChatGroups(); });
      $('#chat-show-all').addEventListener('click', () => {
        const current = state.chatSpaces.find(item => item.id === state.activeSpace);
        current.sourceMode = 'all'; current.hiddenSourceIds = [];
        refreshVisibility();
      });
      $('#chat-hide-all').addEventListener('click', () => {
        const current = state.chatSpaces.find(item => item.id === state.activeSpace);
        current.sourceMode = 'custom'; current.sources = []; current.hiddenSourceIds = [];
        refreshVisibility();
      });
    }
    renderChatGroups();
  };

  function refreshVisibility() {
    renderSourceChips(); renderMessages(); renderDesk(); scheduleWorkspaceSave();
  }
  function renderChatGroups() {
    const host = $('#chat-groups');
    if (!host) return;
    // Do not replace a keyboard-focused toggle when a polling refresh arrives.
    if (host.contains(document.activeElement)) return;
    const space = activeSpaceRecord();
    const chats = realChats().filter(source => fullLabel(source).toLowerCase().includes(nav.search));
    host.innerHTML = grouped(chats, source => `<div class="chat-choice"><label><input type="checkbox" data-chat-visible="${escape(source.id)}" ${visibleIn(source, space) ? 'checked' : ''}><span>${escape(label(source))}<small>${exactWritable(source) ? 'Channel chat' : 'Read only'}</small></span></label>${['twitch', 'youtube', 'kick'].includes(source.provider) ? `<button type="button" data-chat-watch="${escape(source.id)}" data-mode="audio" aria-label="Listen to ${escape(label(source))}">Audio</button><button type="button" data-chat-watch="${escape(source.id)}" data-mode="video" aria-label="Watch ${escape(label(source))}">Video</button>` : ''}</div>`) || '<p class="chat-help">No matching chats. Manage connections to add an account.</p>';
    preserveGroups(host);
    host.querySelectorAll('[data-chat-visible]').forEach(input => input.addEventListener('change', () => {
      const current = state.chatSpaces.find(item => item.id === state.activeSpace);
      const hidden = new Set(current.hiddenSourceIds || []);
      if (input.checked) {
        hidden.delete(input.dataset.chatVisible);
        if (!current.sources.includes(input.dataset.chatVisible)) current.sources.push(input.dataset.chatVisible);
      } else hidden.add(input.dataset.chatVisible);
      current.hiddenSourceIds = [...hidden];
      refreshVisibility();
    }));
    host.querySelectorAll('[data-chat-watch]').forEach(button => button.addEventListener('click', () => { openStreamDock(button.dataset.chatWatch); setStreamMode(button.dataset.mode); }));
  }

  const deskBefore = renderDesk;
  renderDesk = () => {
    const deskBrowserOpen = Boolean($('#desk-tabs .desk-chat-browser')?.open);
    deskBefore();
    const desk = state.desks.find(item => item.id === state.activeDesk);
    const spaces = (desk?.panels || []).map(panel => normalizedSpace(state.chatSpaces.find(space => space.id === panel.chatSpaceId)));
    const chats = realChats().filter(source => spaces.some(space => visibleIn(source, space)));
    const host = $('#desk-tabs');
    host.innerHTML = `<details class="desk-chat-browser" ${deskBrowserOpen ? 'open' : ''}><summary>Chats in this desk <small>${chats.length} available</small></summary><div class="desk-chat-groups">${grouped(chats, source => `<label class="chat-choice"><input type="checkbox" data-desk-chat="${escape(source.id)}" ${(desk?.hiddenSourceIds || []).includes(source.id) ? '' : 'checked'}><span>${escape(label(source))}</span></label>`)}</div></details>`;
    preserveGroups(host);
    host.querySelectorAll('[data-desk-chat]').forEach(input => input.addEventListener('change', () => {
      const hidden = new Set(desk.hiddenSourceIds || []);
      if (input.checked) hidden.delete(input.dataset.deskChat); else hidden.add(input.dataset.deskChat);
      desk.hiddenSourceIds = [...hidden];
      renderDesk(); scheduleWorkspaceSave();
    }));
  };

  renderDestinations = () => {
    // No combined feed, connection placeholder, or previous multi-send can become a recipient.
    const reply = state.messages.find(message => message.id === state.replyToMessageId);
    const selected = state.sources.find(source => source.id === state.selectedDestinations[0]);
    if (state.selectedDestinations.length !== 1 || !(reply ? canReply(selected) : exactWritable(selected))) state.selectedDestinations = [];
    if (reply && state.selectedDestinations.length) { nav.personal = false; nav.recipient = null; }
    const host = $('#destination-chips');
    if (!host.querySelector('#chat-destination')) {
      host.innerHTML = '<select id="chat-destination" aria-label="Send to one chat"></select><div id="personal-recipient" hidden><label for="personal-handle">Person’s SPMT username</label><div class="personal-lookup"><input id="personal-handle" list="personal-contacts" autocomplete="off" placeholder="username"><datalist id="personal-contacts"></datalist><button id="personal-find" type="button">Choose person</button></div><span id="personal-status" role="status"></span></div>';
      $('#chat-destination').addEventListener('change', event => {
        nav.personal = event.target.value === '__personal__'; nav.recipient = null;
        state.replyToMessageId = null;
        state.selectedDestinations = !nav.personal && event.target.value ? [event.target.value] : [];
        renderDestinations();
      });
      $('#personal-handle').addEventListener('input', () => { nav.recipient = null; $('#personal-status').textContent = ''; updateSendLabel(); });
      $('#personal-find').addEventListener('click', choosePerson);
      $('#personal-handle').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); choosePerson(); } });
    }
    const picker = $('#chat-destination');
    const options = realChats().filter(exactWritable).sort((a, b) => fullLabel(a).localeCompare(fullLabel(b)));
    if (reply && canReply(selected) && !options.some(source => source.id === selected.id)) options.push(selected);
    if (document.activeElement !== picker) picker.innerHTML = '<option value="">Choose one chat…</option><option value="__personal__">Personal message → choose a person</option>' + options.map(source => `<option value="${escape(source.id)}">${escape(fullLabel(source))}</option>`).join('');
    picker.value = nav.personal ? '__personal__' : state.selectedDestinations[0] || '';
    $('#personal-recipient').hidden = !nav.personal;
    $('#personal-contacts').innerHTML = [...nav.contacts].map(([username, name]) => `<option value="${escape(username)}">${escape(name)}</option>`).join('');
    $('.destination-label').textContent = 'Send to';
    $('#routing-note').textContent = nav.personal ? 'Private message to one SPMT user.' : reply && selected ? `Reply to ${reply.name} in ${fullLabel(selected)}. Visible in that chat.` : selected && state.selectedDestinations.length ? `Visible to everyone in ${label(selected)}. Not a private message.` : 'Choose a chat or a person. No broadcast destination.';
    $('#compose-input').placeholder = 'Write a message…';
    updateSendLabel();
  };
  function updateSendLabel() {
    $('#send-label').textContent = nav.personal ? nav.recipient ? `Review for @${nav.recipient.username}` : 'Choose person' : state.selectedDestinations.length ? 'Review message' : 'Choose chat';
  }
  async function choosePerson() {
    const username = $('#personal-handle').value.trim().replace(/^@/, '').toLowerCase();
    nav.recipient = null;
    if (!/^[a-z0-9._-]+$/.test(username)) { $('#personal-status').textContent = 'Enter an exact SPMT username.'; return; }
    $('#personal-status').textContent = 'Looking up person…';
    $('#personal-find').disabled = true;
    try {
      const response = await fetch(`/api/user/lookup?username=${encodeURIComponent(username)}`, { credentials: 'include', headers: commlinkAuthHeaders() });
      if (!response.ok) throw new Error(response.status === 404 ? 'No person found with that username.' : 'Could not look up this person. Try again.');
      const user = await response.json();
      if ($('#personal-handle').value.trim().replace(/^@/, '').toLowerCase() !== username || !nav.personal) return;
      if (!user.id || user.username !== username) throw new Error('Could not verify this person.');
      nav.recipient = { id: user.id, username: user.username, name: user.display_name || user.username };
      $('#personal-status').textContent = `${nav.recipient.name} (@${user.username}) selected`;
    } catch (error) { $('#personal-status').textContent = error.message; }
    finally { $('#personal-find').disabled = false; updateSendLabel(); }
  }

  // @names remain message text; they must not silently change the destination.
  showMentionMenu = () => $('#mention-menu').classList.add('hidden');

  openSendPreview = () => {
    const message = $('#compose-input').value.trim();
    if (!message) return toast('Write a message first.');
    const source = state.sources.find(item => item.id === state.selectedDestinations[0]);
    const reply = state.messages.find(item => item.id === state.replyToMessageId);
    if (nav.personal ? !nav.recipient : state.selectedDestinations.length !== 1 || !(reply ? canReply(source) : exactWritable(source))) return toast('Choose one chat or verify a person first.');
    nav.review = nav.personal
      ? { personal: true, recipient: { ...nav.recipient }, message }
      : { personal: false, idempotencyKey: crypto.randomUUID(), action: reply ? 'reply' : 'compose', message, eventId: reply?.id, destinations: [dispatchDestination(source)] };
    $('#modal-message').textContent = message;
    $('#modal-destinations').textContent = nav.personal ? `Private message to ${nav.recipient.name} (@${nav.recipient.username})` : `${reply ? `Reply to ${reply.name} in ` : 'Send to '}${fullLabel(source)}`;
    $('#send-safety-note').textContent = nav.personal ? 'Only this SPMT user receives your message.' : 'Everyone in this channel can read your message.';
    $('#simulate-send').textContent = 'Send message';
    $('#simulate-send').dataset.receiptMode = '';
    $('#send-modal').classList.remove('hidden');
  };
  const dispatchBefore = dispatchComposer;
  dispatchComposer = async () => {
    const button = $('#simulate-send');
    if (button.disabled) return;
    if (button.dataset.receiptMode === 'done' || button.dataset.receiptMode === 'retry') return dispatchBefore();
    const review = nav.review;
    if (!review) return toast('Review your message before sending.');
    button.disabled = true; button.textContent = 'Sending…';
    try {
      if (review.personal) {
        const response = await fetch('/api/messages', { method: 'POST', credentials: 'include', headers: commlinkAuthHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ to: review.recipient.username, body: review.message, sourceApp: 'commlink' }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.sent !== true) throw new Error('Could not confirm delivery. Check your personal messages before sending again.');
        $('#send-safety-note').textContent = `Sent to @${review.recipient.username}.`;
        button.dataset.receiptMode = 'done'; button.textContent = 'Done';
      } else {
        const { personal, ...request } = review;
        const result = await requestCommlinkDispatch(request);
        renderDispatchReceipts(result);
        if (!result.delivered) return;
      }
      if ($('#compose-input').value.trim() === review.message) $('#compose-input').value = '';
      state.replyToMessageId = null;
    } catch (error) {
      $('#send-safety-note').textContent = review.personal ? 'Could not confirm delivery. Check your personal messages before sending again.' : error.message || 'Could not send this message.';
      // The personal-message API has no idempotency key. Never retry an uncertain send automatically.
      button.dataset.receiptMode = review.personal ? 'done' : '';
      button.textContent = review.personal ? 'Close' : 'Try again';
    } finally { button.disabled = false; }
  };

  const identityBefore = loadCommlinkIdentity;
  loadCommlinkIdentity = async () => {
    await identityBefore();
    nav.contacts.clear(); nav.conversations.clear();
    if (!state.accountIdentity?.username) { nav.personal = false; nav.recipient = null; nav.review = null; renderDestinations(); return; }
    const username = state.accountIdentity.username;
    try {
      const response = await fetch('/api/messages?limit=200&type=direct', { credentials: 'include', headers: commlinkAuthHeaders() });
      if (!response.ok) return;
      const data = await response.json();
      if (state.accountIdentity?.username !== username) return;
      const conversations = new Map();
      for (const message of data.messages || []) {
        const peer = message.from_user === username ? message.to_user : message.from_user;
        const name = message.from_user === username ? message.to_name : message.from_name;
        if (!peer) continue;
        nav.contacts.set(peer, name || peer);
        if (!conversations.has(message.conversation_id)) conversations.set(message.conversation_id, new Set());
        conversations.get(message.conversation_id).add(`@${peer}`);
      }
      for (const [id, peers] of conversations) nav.conversations.set(id, [...peers].join(', '));
      renderSourceChips(); renderDestinations();
    } catch { /* Exact username lookup remains available if recent contacts cannot load. */ }
  };
})();
