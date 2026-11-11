'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const paletteFallback = ['#63e0d5', '#ffc267'];
  let socket = null;
  let connectPromise = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let resumePending = false;
  let justResumedSession = false;
  let room = null;
  let selfPlayerId = null;
  let publicState = null;
  let cursorMap = new Map();
  let commandSequence = 0;
  let lastBoardSignature = '';
  let lastEventStamp = '';
  let localMessageTimer = null;
  let roomRequestPending = false;
  let roomRequestTimer = null;
  let commandWatchdog = null;
  let returnToHomeOnLeave = false;
  let introStage = 'idle';
  let introTimer = null;
  let introToken = 0;
  let introMatchId = null;
  let landingSyncRetries = 0;
  let rouletteActivatedByServer = false;
  let rouletteStarterId = null;
  const SHOP_CATALOG = window.MINEFALL_COSMETIC_CATALOG || {};
  const ARENA_SKINS = (SHOP_CATALOG.arena || []).map(item => item.id);
  const CHARACTER_SKINS = (SHOP_CATALOG.skin || []).map(item => item.id);
  const AVATARS = (SHOP_CATALOG.avatar || []).map(item => item.id);
  const ARENA_LABELS = Object.fromEntries((SHOP_CATALOG.arena || []).map(item => [item.id, item.title]));
  let lastRematchNoticeStamp = '';
  const CLIENT_ID_KEY = 'minefall.online.identity.v1';
  const SESSION_KEY = 'minefall.online.resume.v1';
  const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000];

  function readResumeSession() {
    try {
      const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!value || typeof value.resumeToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.resumeToken)) return null;
      return { roomCode: String(value.roomCode || ''), playerId: String(value.playerId || ''), resumeToken: value.resumeToken };
    } catch { return null; }
  }
  let resumeSession = readResumeSession();

  function saveResumeSession(value) {
    if (!value || typeof value.resumeToken !== 'string') return;
    resumeSession = {
      roomCode: String(value.roomCode || resumeSession?.roomCode || ''),
      playerId: String(value.playerId || resumeSession?.playerId || ''),
      resumeToken: value.resumeToken
    };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(resumeSession)); }
    catch { showMessage('Không thể lưu phiên khôi phục trong tab này. Đừng đóng tab khi đang chơi.', true); }
  }

  function clearResumeSession() {
    resumeSession = null;
    resumePending = false;
    justResumedSession = false;
    reconnectAttempt = 0;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }

  function scheduleReconnect() {
    if (!resumeSession || reconnectTimer) return;
    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    reconnectAttempt++;
    setConnectionStatus('Đang thử kết nối lại…');
    showMessage('Mất kết nối. Đang tự khôi phục phiên chơi…', true);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      ensureConnected().then(connected => {
        if (!connected && resumeSession) scheduleReconnect();
      });
    }, delay);
  }

  function clearMessage() {
    if (localMessageTimer) { clearTimeout(localMessageTimer); localMessageTimer = null; }
    for (const id of ['onlineMessage', 'onlineRoomFeedback']) { const node = $(id); if (node) node.textContent = ''; }
  }
  function showMessage(message, isError = false) {
    if (localMessageTimer) { clearTimeout(localMessageTimer); localMessageTimer = null; }
    for (const id of ['onlineMessage', 'onlineRoomFeedback']) {
      const node = $(id);
      if (!node) continue;
      node.textContent = message;
      node.style.color = isError ? '#ff9da5' : '#b7cad3';
    }
    const shown = String(message || '');
    localMessageTimer = setTimeout(() => {
      localMessageTimer = null;
      for (const id of ['onlineMessage', 'onlineRoomFeedback']) { const node = $(id); if (node && node.textContent === shown) node.textContent = ''; }
    }, isError ? 5200 : 3400);
  }

  function setConnectionStatus(text, connected = false) {
    for (const id of ['onlineConnectionStatus', 'onlineRoomConnectionStatus']) {
      const node = $(id);
      if (!node) continue;
      node.textContent = text;
      node.classList.toggle('connected', !!connected);
    }
  }

  const SCREEN_IDS = ['homeScreen', 'shopScreen', 'onlineScreen', 'onlineRoomScreen', 'gameScreen'];
  function activateScreen(id) {
    for (const screenId of SCREEN_IDS) $(screenId)?.classList.toggle('active', screenId === id);
    const inOnlineSession = id === 'onlineRoomScreen' || (id === 'gameScreen' && !!window.MINEFALL_APP?.isOnlineMatch?.());
    document.body.classList.toggle('online-session-active', inOnlineSession);
  }

  function setRoomRequestPending(pending, kind = '') {
    roomRequestPending = !!pending;
    if (roomRequestTimer) { clearTimeout(roomRequestTimer); roomRequestTimer = null; }
    const create = $('onlineCreateBtn');
    const join = $('onlineJoinBtn');
    if (create) { create.disabled = roomRequestPending || !!room; create.textContent = roomRequestPending && kind === 'create' ? 'Đang tạo phòng…' : '＋ Tạo phòng'; }
    if (join) { join.disabled = roomRequestPending || !!room; join.textContent = roomRequestPending && kind === 'join' ? 'Đang tham gia…' : 'Tham gia phòng'; }
    if (roomRequestPending) {
      roomRequestTimer = setTimeout(() => {
        roomRequestTimer = null;
        setRoomRequestPending(false);
        showMessage('Máy chủ chưa phản hồi. Thử lại sau.', true);
      }, 9000);
    }
  }

  function connectedSocket() {
    return !!socket && socket.readyState === WebSocket.OPEN;
  }

  function send(type, payload = {}) {
    if (!connectedSocket()) {
      showMessage('Mất kết nối. Đang chờ máy chủ.', true);
      return false;
    }
    if (socket.bufferedAmount > 256 * 1024) {
      showMessage('Kết nối đang bận. Thử lại sau giây lát.', true);
      return false;
    }
    try {
      socket.send(JSON.stringify({ type, payload }));
      return true;
    } catch {
      setConnectionStatus('Mất kết nối');
      showMessage('Không gửi được yêu cầu. Kiểm tra kết nối.', true);
      return false;
    }
  }

  function ensureConnected() {
    if (connectedSocket()) return Promise.resolve(true);
    if (connectPromise) return connectPromise;
    if (!('WebSocket' in window)) {
      setConnectionStatus('WebSocket không hỗ trợ');
      showMessage('Trình duyệt này không hỗ trợ WebSocket.', true);
      return Promise.resolve(false);
    }
    if (location.protocol === 'file:') {
      setConnectionStatus('Cần chạy server');
      showMessage('Không mở bằng file://. Hãy giải nén dự án, chạy npm install rồi npm start; sau đó mở http://localhost:3000.', true);
      return Promise.resolve(false);
    }
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const endpoint = `${scheme}//${location.host}/ws`;
    setConnectionStatus('Đang kết nối…');
    connectPromise = new Promise(resolve => {
      let ws;
      try {
        ws = new WebSocket(endpoint);
        socket = ws;
      } catch {
        connectPromise = null;
        setConnectionStatus('Không thể kết nối');
        showMessage('Không tạo được kết nối WebSocket. Kiểm tra server có đang chạy không.', true);
        resolve(false);
        return;
      }
      let settled = false;
      let connectionTimer = null;
      const done = value => {
        if (settled) return;
        settled = true;
        if (connectionTimer) { clearTimeout(connectionTimer); connectionTimer = null; }
        resolve(value);
      };
      connectionTimer = setTimeout(() => {
        if (socket !== ws || settled) return;
        setConnectionStatus('Không thể kết nối');
        showMessage('Không kết nối được máy chủ. Kiểm tra server rồi thử lại.', true);
        socket = null;
        try { ws.close(); } catch {}
        done(false);
      }, 8000);
      ws.addEventListener('open', () => {
        if (socket !== ws) return;
        if (resumeSession) {
          resumePending = true;
          setConnectionStatus('Đang khôi phục phiên…');
          try {
            ws.send(JSON.stringify({ type: 'room:resume', payload: { resumeToken: resumeSession.resumeToken } }));
            done(true);
          } catch {
            try { ws.close(); } catch {}
            done(false);
          }
          return;
        }
        setConnectionStatus('Đã kết nối', true);
        showMessage('Đã kết nối.');
        done(true);
      }, { once: true });
      ws.addEventListener('message', event => {
        if (socket !== ws) return;
        let msg;
        try { msg = JSON.parse(event.data); }
        catch { showMessage('Dữ liệu máy chủ không hợp lệ.', true); return; }
        handleMessage(msg);
      });
      ws.addEventListener('error', () => {
        if (socket !== ws) return;
        setConnectionStatus('Không thể kết nối');
        try { ws.close(); } catch {}
        done(false);
      });
      ws.addEventListener('close', () => {
        if (socket !== ws) { done(false); return; }
        const hadRoom = !!room;
        const hadPendingRequest = roomRequestPending;
        socket = null;
        connectPromise = null;
        setRoomRequestPending(false);
        setConnectionStatus('Mất kết nối');
        if (resumeSession) {
          if (hadRoom) activateScreen(window.MINEFALL_APP?.isOnlineMatch?.() ? 'gameScreen' : 'onlineRoomScreen');
          scheduleReconnect();
        } else if (hadRoom) {
          resetPregame(true);
          window.MINEFALL_APP?.resetOnlineGameToLobby();
          room = null; selfPlayerId = null; publicState = null; cursorMap.clear(); lastBoardSignature = '';
          renderRoom();
          activateScreen(returnToHomeOnLeave ? 'homeScreen' : 'onlineScreen');
          showMessage('Mất kết nối. Tạo hoặc tham gia phòng mới để tiếp tục.', true);
        } else if (hadPendingRequest) {
          showMessage('Mất kết nối. Thử lại sau.', true);
        }
        done(false);
      });
    }).finally(() => { connectPromise = null; });
    return connectPromise;
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'room:session':
        saveResumeSession(msg);
        resumePending = false;
        reconnectAttempt = 0;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        setConnectionStatus('Đã kết nối', true);
        if (msg.resumed) {
          justResumedSession = true;
          showMessage('Đã khôi phục kết nối. Trận đấu tiếp tục theo trạng thái máy chủ.');
        } else {
          justResumedSession = false;
        }
        break;
      case 'system:hello':
        showMessage('Đã kết nối.');
        break;
      case 'room:update': {
        setRoomRequestPending(false);
        const previousRoom = room;
        const previousRematch = previousRoom?.rematch || null;
        room = msg.room || null;
        if (room) clearMessage();
        selfPlayerId = msg.selfPlayerId || selfPlayerId;
        cursorMap = new Map((room?.cursors || []).map(item => [item.playerId, item.index]));
        if (room?.status !== 'playing') {
          publicState = null; lastBoardSignature = '';
          if (window.MINEFALL_APP?.isOnlineMatch?.()) window.MINEFALL_APP.resetOnlineGameToLobby();
        }
        renderRoom();
        if (room && !window.MINEFALL_APP?.isOnlineMatch?.()) activateScreen('onlineRoomScreen');
        window.MINEFALL_APP?.updateOnlineRematchControls?.(room?.rematch || null);
        const rematch = room?.rematch;
        if (rematch?.invitedBy && rematch.invitedBy !== selfPlayerId && rematch.invitedBy !== previousRematch?.invitedBy && rematch.count > 0) {
          const stamp = `${room.code}:${rematch.invitedBy}:${rematch.count}`;
          if (stamp !== lastRematchNoticeStamp) {
            lastRematchNoticeStamp = stamp;
            window.MINEFALL_APP?.notifyOnlineRematch?.(`${rematch.inviterName || 'Đối thủ'} mời bạn tái đấu · ${rematch.count}/${rematch.required || 2}`);
          }
        }
        if (room?.status === 'playing') startPregameIfNeeded();
        else if (introStage !== 'idle') resetPregame(true);
        break;
      }
      case 'match:roulette:start': {
        if (!room || msg.roomCode !== room.code || (publicState?.matchId && msg.matchId !== publicState.matchId)) break;
        rouletteActivatedByServer = true;
        rouletteStarterId = msg.startPlayerId || rouletteStarterId;
        if (introStage === 'landing') runOnlineRoulette(introToken);
        break;
      }
      case 'match:state': {
        const incomingState = msg.state || null;
        const newMatch = !!incomingState && incomingState.matchId !== introMatchId && introStage === 'done';
        // The server includes the authoritative room config with every match snapshot.
        // Merge it before pregame/UI rendering so a stale lobby object cannot fall back to
        // the default 10-minute label while the selected match uses another duration.
        if (room && msg.roomConfig && typeof msg.roomConfig === 'object') {
          room = { ...room, config: { ...room.config, ...msg.roomConfig } };
        }
        publicState = incomingState;
        cursorMap = new Map((msg.cursors || []).map(item => [item.playerId, item.index]));
        if (justResumedSession && incomingState && (incomingState.started || incomingState.ended)) {
          justResumedSession = false;
          resetPregame(true);
          introStage = 'done';
          introMatchId = incomingState.matchId || null;
          if (room?.status === 'playing') {
            window.MINEFALL_APP?.applyOnlineSnapshot(incomingState, selfPlayerId, {
              ...room,
              config: { ...room.config, ...(msg.roomConfig || {}) }
            });
          }
        } else if (justResumedSession && incomingState) {
          justResumedSession = false;
        }
        if (room?.status === 'playing') {
          if (introStage === 'idle' || newMatch) startPregameIfNeeded(true);
          else if (!introMatchId && publicState?.matchId) introMatchId = publicState.matchId;
          if (introStage === 'landing' && rouletteActivatedByServer) runOnlineRoulette(introToken);
          if (introStage === 'done' && (publicState?.started || publicState?.ended)) {
            window.MINEFALL_APP?.applyOnlineSnapshot(publicState, selfPlayerId, {
              ...room,
              config: { ...room.config, ...(msg.roomConfig || {}) }
            });
          }
        }
        break;
      }
      case 'game:emote': {
        window.MINEFALL_APP?.showOnlineEmote(msg.playerId, msg.emoji, msg.caption);
        break;
      }
      case 'game:cursor': {
        cursorMap.set(msg.playerId, msg.index);
        // Cursor position is retained as lightweight state; the shared native board renders player movement.

        break;
      }
      case 'command:ack':
        if (msg.accepted && msg.action === 'move') showMessage('Đã di chuyển.');
        else if (msg.accepted) showMessage('Đã cập nhật.');
        else showMessage('Không thể thực hiện nước đi.', true);
        break;
      case 'match:begin:ack':
        if (msg.accepted) showMessage('Trận online đã bắt đầu. Hãy chú ý đồng hồ lượt.');
        break;
      case 'match:returned':
        window.MINEFALL_APP?.resetOnlineGameToLobby();
        showMessage('Đã quay lại phòng chờ.');
        break;
      case 'match:rematch:ack':
        showMessage(msg.restarted ? 'Cả phòng đã đồng ý tái đấu. Đang dựng lại sàn và roulette…' : 'Đã ghi nhận lời mời tái đấu. Chờ người chơi còn lại xác nhận.');
        break;
      case 'server:error':
        if (roomRequestPending) setRoomRequestPending(false);
        if (resumePending) {
          clearResumeSession();
          resetPregame(true);
          window.MINEFALL_APP?.resetOnlineGameToLobby();
          room = null; selfPlayerId = null; publicState = null; cursorMap.clear(); lastBoardSignature = '';
          renderRoom();
          activateScreen('onlineScreen');
          showMessage(msg.error?.message || 'Không thể khôi phục phiên. Phòng có thể đã hết thời gian chờ.', true);
          break;
        }
        showMessage(msg.error?.message || 'Yêu cầu bị từ chối.', true);
        if (window.MINEFALL_APP?.isOnlineMatch?.()) window.MINEFALL_APP.onlineCommandRejected(msg.error?.message || 'Máy chủ từ chối hành động.');
        break;
      case 'room:left':
        clearResumeSession();
        if (commandWatchdog) { clearTimeout(commandWatchdog); commandWatchdog = null; }
        resetPregame(true);
        setRoomRequestPending(false);
        room = null; selfPlayerId = null; publicState = null; cursorMap.clear(); lastBoardSignature = '';
        renderRoom();
        if (returnToHomeOnLeave) { returnToHomeOnLeave = false; activateScreen('homeScreen'); }
        else activateScreen('onlineScreen');
        showMessage('Đã rời phòng.');
        break;
      default:
        // Ignore messages from future protocol versions without breaking the lobby.
        break;
    }
  }

  function coordinate(index, size) {
    const row = Math.floor(index / size), col = index % size;
    return String.fromCharCode(65 + col) + (row + 1);
  }

  function syncOnlineSetupFromHome() {
    if (room) return;
    const homeSize = $('boardSizeSelect')?.value;
    const homeDifficulty = document.querySelector('[data-difficulty].active')?.dataset.difficulty;
    const homeMatchDuration = $('matchDurationSelect')?.value;
    if (homeSize && $('onlineBoardSize')) $('onlineBoardSize').value = homeSize;
    if (homeDifficulty && $('onlineDifficulty')) $('onlineDifficulty').value = homeDifficulty;
    if (homeMatchDuration && $('onlineMatchDuration')) $('onlineMatchDuration').value = homeMatchDuration;
  }

  function openOnlineScreen() {
    returnToHomeOnLeave = false;
    syncOnlineSetupFromHome();
    activateScreen('onlineScreen');
    ensureConnected();
  }

  function backHome() {
    if (commandWatchdog) { clearTimeout(commandWatchdog); commandWatchdog = null; }
    returnToHomeOnLeave = !!room;
    clearResumeSession();
    resetPregame(true);
    window.MINEFALL_APP?.resetOnlineGameToLobby();
    if (room && connectedSocket()) send('room:leave');
    setRoomRequestPending(false);
    room = null; selfPlayerId = null; publicState = null; cursorMap.clear(); lastBoardSignature = '';
    activateScreen('homeScreen');
    $('shopBtn')?.classList.remove('hidden');
    $('homeBtn')?.classList.add('hidden');
    renderRoom();
  }

  async function createRoom() {
    if (roomRequestPending) return;
    const ok = await ensureConnected();
    if (!ok) return;
    if (roomRequestPending) return;
    if (room) { showMessage('Bạn đang ở trong một phòng. Hãy rời phòng trước.', true); return; }
    const name = $('onlinePlayerName').value.trim() || 'Người chơi';
    const boardSize = Number($('onlineBoardSize').value);
    const difficulty = $('onlineDifficulty').value;
    const maxPlayers = Number($('onlineMaxPlayers')?.value || 2);
    const matchDurationMinutes = Number($('onlineMatchDuration')?.value ?? 10);
    const cosmetics = getLocalCosmetics();
    setRoomRequestPending(true, 'create');
    if (!send('room:create', { name, identity: getClientIdentity(), cosmetics, config: { boardSize, difficulty, matchDurationMinutes, arenaSkin: getLocalEquippedArena(), bombSkin: cosmetics.bomb, maxPlayers } })) setRoomRequestPending(false);
  }

  async function joinRoom() {
    if (roomRequestPending) return;
    const ok = await ensureConnected();
    if (!ok) return;
    if (roomRequestPending) return;
    if (room) { showMessage('Bạn đang ở trong một phòng. Hãy rời phòng trước.', true); return; }
    const name = $('onlinePlayerName').value.trim() || 'Người chơi';
    const code = $('onlineJoinCode').value.trim().toUpperCase();
    if (code.length < 4) { showMessage('Nhập mã phòng được chia sẻ từ chủ phòng.', true); return; }
    setRoomRequestPending(true, 'join');
    if (!send('room:join', { name, code, identity: getClientIdentity(), cosmetics: getLocalCosmetics() })) setRoomRequestPending(false);
  }

  function syncHeaderConfig() {
    let size, difficulty;
    if (room) { size = room.config.boardSize; difficulty = room.config.difficulty; }
    else { size = Number($('boardSizeSelect')?.value || 16); difficulty = document.querySelector('[data-difficulty].active')?.dataset.difficulty || 'hard'; }
    const density = { easy: 0.25, medium: 0.35, hard: 0.50 }[difficulty] || 0.5;
    if ($('headerBoardSize')) $('headerBoardSize').textContent = `${size} × ${size}`;
    if ($('headerMineCount')) $('headerMineCount').textContent = String(Math.round(size * size * density));
  }

  function renderRoom() {
    syncHeaderConfig();
    const inRoom = !!room;
    const isPlaying = inRoom && room.status === 'playing';
    if (inRoom && !window.MINEFALL_APP?.isOnlineMatch?.()) activateScreen('onlineRoomScreen');
    if (!inRoom) $('onlineRoomScreen')?.classList.remove('active');
    $('onlineSetupLayout')?.classList.toggle('online-hidden', isPlaying);
    $('onlineRoomPanel')?.classList.toggle('online-hidden', !inRoom || isPlaying);
    $('onlineSyncPanel')?.classList.add('online-hidden');
    const controls = ['onlinePlayerName', 'onlineBoardSize', 'onlineDifficulty', 'onlineMatchDuration', 'onlineMaxPlayers', 'onlineJoinCode'];
    controls.forEach(id => { const el = $(id); if (el) el.disabled = inRoom || roomRequestPending; });
    if ($('onlineCreateBtn')) $('onlineCreateBtn').disabled = inRoom || roomRequestPending;
    if ($('onlineJoinBtn')) $('onlineJoinBtn').disabled = inRoom || roomRequestPending;
    if (!inRoom) {
      $('onlineRoomCode').textContent = '------';
      $('onlinePlayers').replaceChildren();
      $('onlineStartBtn').classList.add('online-hidden');
      $('onlineReadyBtn').disabled = true;
      publicState = null;
      $('onlineSyncPanel').classList.add('online-hidden');
      $('onlineBoard').replaceChildren();
      $('onlineMiniPlayers').replaceChildren();
      syncOnlineSetupFromHome();
      applyOnlineArenaSkin('arena-standard');
      updateHostArenaPreview(getLocalEquippedArena(), 'Sàn dùng khi bạn tạo phòng');
      updateHostBombPreview(getLocalCosmetics().bomb, 'Mìn nổ dùng khi bạn tạo phòng');
      return;
    }

    $('onlineRoomCode').textContent = room.code;
    $('onlineJoinCode').value = room.code;
    if ($('onlineBoardSize')) $('onlineBoardSize').value = String(room.config.boardSize);
    if ($('onlineDifficulty')) $('onlineDifficulty').value = String(room.config.difficulty);
    if ($('onlineMaxPlayers')) $('onlineMaxPlayers').value = String(room.config.maxPlayers);
    if ($('onlineMatchDuration')) $('onlineMatchDuration').value = String(room.config.matchDurationMinutes || 10);
    const requiredPlayers = Number(room.config.maxPlayers || 2);
    const missingPlayers = Math.max(0, requiredPlayers - room.players.length);
    const statusText = room.status === 'waiting'
      ? (missingPlayers > 0 ? `Đang chờ người chơi · ${room.players.length}/${requiredPlayers}` : `Đủ người · Chờ sẵn sàng`)
      : room.status === 'ready'
        ? `Sẵn sàng · ${requiredPlayers}/${requiredPlayers}`
        : 'Đang chuẩn bị trận…';
    $('onlineRoomStateText').textContent = `${statusText} · ${room.config.boardSize}×${room.config.boardSize} · ${room.config.matchDurationMinutes || 10} phút`;
    applyOnlineArenaSkin(room.config.arenaSkin || 'arena-standard');
    updateHostArenaPreview(room.config.arenaSkin || 'arena-standard', 'Sàn đấu của chủ phòng');
    updateHostBombPreview(room.config.bombSkin || 'bomb-standard', 'Mìn nổ của chủ phòng');
    const roster = $('onlinePlayers'); roster.replaceChildren();
    const slots = [...room.players];
    while (slots.length < requiredPlayers) slots.push(null);
    slots.forEach((p) => {
      const card = document.createElement('div'); card.className = 'online-player-slot';
      const dot = document.createElement('div'); dot.className = 'online-player-dot'; dot.style.background = p?.color || '#324550'; dot.textContent = p ? ({'avatar-cadet':'🎮','avatar-fox':'🦊','avatar-robot':'🤖','avatar-skull':'💀','avatar-astronaut':'👨‍🚀','avatar-crown':'👑'}[p.avatar] || p.name.slice(0, 1).toUpperCase()) : '?';
      const meta = document.createElement('div'); meta.className = 'online-player-meta';
      const name = document.createElement('div'); name.className = 'online-player-name'; name.textContent = p ? p.name + (p.id === room.hostPlayerId ? ' · CHỦ PHÒNG' : '') : 'Chỗ trống';
      const state = document.createElement('div'); state.className = 'online-player-state'; state.textContent = p ? (p.connected ? 'Đã kết nối' : 'Mất kết nối') : 'Chưa có người tham gia';
      meta.append(name, state);
      const badge = document.createElement('span'); badge.className = 'ready-badge' + (p?.ready ? ' ready' : ''); badge.textContent = p?.ready ? 'SẴN SÀNG' : p ? 'CHƯA SẴN SÀNG' : 'TRỐNG';
      card.append(dot, meta, badge); roster.append(card);
    });
    const me = room.players.find(p => p.id === selfPlayerId);
    $('onlineReadyBtn').disabled = !me || isPlaying;
    $('onlineReadyBtn').textContent = me?.ready ? '↻ Hủy sẵn sàng' : '✓ Sẵn sàng';
    const canHostStart = selfPlayerId === room.hostPlayerId && room.status === 'ready';
    $('onlineStartBtn').classList.toggle('online-hidden', !canHostStart);
    $('onlineReadyBtn').classList.toggle('online-hidden', isPlaying);
    $('onlineRoomNote').textContent = isPlaying
      ? 'Đang chuẩn bị trận.'
      : (selfPlayerId === room.hostPlayerId ? 'Chia sẻ mã phòng để mời bạn bè.' : 'Chờ chủ phòng bắt đầu trận.');
    // The sync-only board was a temporary 0.9C scaffold. During gameplay, the shared
    // offline gameScreen is the sole board and HUD; never show a parallel online renderer.
    $('onlineSyncPanel').classList.add('online-hidden');
    if (isPlaying) startPregameIfNeeded();
  }

  function renderSyncBoard() {
    if (!publicState || !room || introStage !== 'done') return;
    $('onlineSyncPanel').classList.remove('online-hidden');
    applyOnlineArenaSkin(room.config.arenaSkin || 'arena-standard');
    const starter = room.players.find(p => p.id === publicState.turn.currentPlayerId)?.name || '—';
    $('onlineSyncMeta').textContent = `Match ${publicState.matchId} · bàn ${publicState.board.size}×${publicState.board.size} · roulette chọn ${starter} đi trước.`;
    const revealed = publicState.board.cells.filter(c => c.revealed || c.exploded || c.endRevealed).length;
    $('onlineBoardStats').textContent = `${publicState.board.size}×${publicState.board.size} · ${publicState.board.cells.length} ô · ${publicState.board.mineCount} mìn · ${revealed} ô đã mở`;
    const signature = JSON.stringify([publicState.board.size, publicState.board.cells.map(c => [c.revealed,c.mine,c.adj,c.flagOwner,c.exploded,c.endRevealed]), (publicState.players || []).map(p => [p.id,p.pos,p.alive,p.connected]), publicState.turn?.currentPlayerId, publicState.status]);
    if (signature !== lastBoardSignature) { lastBoardSignature = signature; renderOnlineBoard(); }
    renderMiniPlayers(); renderOnlineControls(); renderOnlineResults(); updateOnlineEvent();
  }

  function getLocalProfile() {
    try { return JSON.parse(localStorage.getItem('minefall.profile.v1') || 'null') || {}; }
    catch { return {}; }
  }

  function getLocalEquippedArena() {
    const profile = getLocalProfile();
    const arena = profile?.equipped?.arena;
    return ARENA_SKINS.includes(arena) ? arena : 'arena-standard';
  }

  function getLocalCosmetics() {
    const profile = getLocalProfile();
    const equipped = profile?.equipped || {};
    const result = {};
    for (const [category, items] of Object.entries(SHOP_CATALOG)) {
      if (category === 'arena') continue; // Arena is controlled by the room host.
      const fallback = (items.find(item => item.defaultEquipped) || items[0])?.id;
      const value = equipped[category];
      result[category] = items.some(item => item.id === value) ? value : fallback;
    }
    return result;
  }

  function getClientIdentity() {
    try {
      const stored = sessionStorage.getItem(CLIENT_ID_KEY);
      if (stored && /^[a-zA-Z0-9_-]{12,80}$/.test(stored)) return stored;
      const token = `mf-${(crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g, '')}`.slice(0, 80);
      sessionStorage.setItem(CLIENT_ID_KEY, token);
      return token;
    } catch {
      return `mf-session-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`.slice(0, 80);
    }
  }

  function updateHostArenaPreview(skin, prefix = 'Sàn đấu') {
    const valid = ARENA_SKINS.includes(skin) ? skin : 'arena-standard';
    const swatch = $('onlineHostArenaSwatch');
    if (swatch) swatch.className = 'online-arena-swatch ' + valid;
    if ($('onlineHostArenaPreviewText')) $('onlineHostArenaPreviewText').textContent = `${prefix}: ${ARENA_LABELS[valid]}`;
  }
  function updateHostBombPreview(bombId, prefix = 'Mìn nổ') {
    const bombs = SHOP_CATALOG.bomb || [];
    const item = bombs.find(candidate => candidate.id === bombId) || bombs.find(candidate => candidate.id === 'bomb-standard') || bombs[0];
    if (!item) return;
    const src = item.asset ? `/assets/mines/${item.asset}` : '';
    const previewNodes = [[$('onlineHostBombSwatch'), $('onlineHostBombPreviewText')], [$('onlineBombSwatch'), $('onlineBombName')]];
    for (const [image, label] of previewNodes) {
      if (image && src && image.getAttribute('src') !== src) image.setAttribute('src', src);
      if (label) label.textContent = `${prefix}: ${item.title}`;
    }
  }
  function refreshCosmeticPreviews() {
    if (room) {
      updateHostArenaPreview(room.config.arenaSkin || 'arena-standard', 'Sàn đấu của chủ phòng');
      updateHostBombPreview(room.config.bombSkin || 'bomb-standard', 'Mìn nổ của chủ phòng');
    } else {
      updateHostArenaPreview(getLocalEquippedArena(), 'Sàn dùng khi bạn tạo phòng');
      updateHostBombPreview(getLocalCosmetics().bomb, 'Mìn nổ dùng khi bạn tạo phòng');
    }
  }

  function applyOnlineArenaSkin(skin) {
    const valid = ARENA_SKINS.includes(skin) ? skin : 'arena-standard';
    const wrap = $('onlineBoardWrap');
    if (wrap) {
      for (const arena of ARENA_SKINS) wrap.classList.remove(arena);
      wrap.classList.add(valid);
    }
    const swatch = $('onlineArenaSwatch');
    if (swatch) {
      swatch.className = 'online-arena-swatch ' + valid;
      swatch.setAttribute('aria-label', ARENA_LABELS[valid]);
    }
    if ($('onlineArenaName')) $('onlineArenaName').textContent = ARENA_LABELS[valid] + ' · sàn của chủ phòng';
  }

  function showOnlineIntro(html) {
    const overlay = $('overlay'); const panel = $('overlayPanel');
    if (!overlay || !panel) return;
    overlay.classList.add('online-intro-overlay');
    panel.classList.add('online-intro-panel');
    panel.innerHTML = html;
    overlay.classList.remove('hidden');
  }

  function hideOnlineIntro() {
    $('overlay')?.classList.add('hidden');
    $('overlay')?.classList.remove('online-intro-overlay');
    $('overlayPanel')?.classList.remove('online-intro-panel');
  }

  function resetPregame(hideOverlay = false) {
    introToken++;
    if (introTimer) { clearTimeout(introTimer); introTimer = null; }
    introStage = 'idle';
    introMatchId = null;
    landingSyncRetries = 0;
    rouletteActivatedByServer = false;
    rouletteStarterId = null;
    if (hideOverlay) hideOnlineIntro();
  }

  function startPregameIfNeeded(force = false) {
    if (!room || room.status !== 'playing') return;
    const configuredSize = Number(room.config?.boardSize || 0);
    const board = publicState?.board;
    // room:update can arrive just before match:state. Do not begin the cinematic using the
    // previous match or a local 16x16 default; wait for this room's authoritative board.
    if (!publicState?.matchId || !board || !Array.isArray(board.cells) ||
        !Number.isInteger(configuredSize) || board.size !== configuredSize || board.cells.length !== configuredSize * configuredSize) {
      if (introStage === 'idle' || force) send('state:request');
      return;
    }
    const matchId = publicState.matchId;
    if (!force && introStage !== 'idle') {
      if (!introMatchId && matchId) introMatchId = matchId;
      return;
    }
    if (!force && introStage === 'done' && introMatchId === matchId) return;
    resetPregame(false);
    introStage = 'preparing';
    introMatchId = matchId;
    const token = introToken;
    const arena = ARENA_SKINS.includes(room.config.arenaSkin) ? room.config.arenaSkin : 'arena-standard';
    showOnlineIntro(
      `<div class="online-intro-kicker">TRẬN ĐÃ GHÉP · 01</div>` +
      `<div class="arena-assembly ${arena}"><div class="assembly-glow"></div><div class="assembly-grid">${Array.from({length:36},(_,i)=>`<span style="animation-delay:${i * 22}ms"></span>`).join('')}</div><div class="assembly-pod"><div class="pod-shell"></div><div class="pod-window"></div><div class="pod-flame"></div></div></div>` +
      `<h2>ĐANG DỰNG SÀN</h2>` +
      `<p>${ARENA_LABELS[arena]} · ${room.players.length} người chơi</p>` +
      `<div class="online-prep-progress"><span></span></div><div class="online-prep-meta">${room.config.boardSize}×${room.config.boardSize} · ${room.config.mineCount} mìn · ${room.config.matchDurationMinutes || 10} phút · ${room.players.length} người chơi</div>`
    );
    if (introTimer) clearTimeout(introTimer);
    introTimer = setTimeout(() => {
      introTimer = null;
      if (token !== introToken || !room || room.status !== 'playing') return;
      showLandingSequence(token);
    }, 2400);
  }

  function landingPreviewMarkup(arena) {
    const board = publicState?.board;
    if (!board?.spawn || !Array.isArray(board.cells)) return '';
    const configuredSize = Number(room?.config?.boardSize || 0);
    if (configuredSize && board.size !== configuredSize) {
      return `<div class="online-arena-preview ${arena}"><div class="arena-preview-mark">${ARENA_LABELS[arena]}<small>Đang đồng bộ bàn ${configuredSize}×${configuredSize} từ máy chủ…</small></div></div>`;
    }
    const size = configuredSize || board.size;
    const zone = new Set(board.zone || []);
    const clueRing = new Set(board.clueRing || []);
    const opening = [...zone, ...clueRing];
    if (!opening.length) return '';
    const coords = opening.map(index => ({ r: Math.floor(index / size), c: index % size }));
    const minR = Math.min(...coords.map(point => point.r));
    const maxR = Math.max(...coords.map(point => point.r));
    const minC = Math.min(...coords.map(point => point.c));
    const maxC = Math.max(...coords.map(point => point.c));
    const rows = maxR - minR + 1, cols = maxC - minC + 1;
    const spans = [];
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const index = r * size + c;
        const cell = board.cells[index];
        const isZone = zone.has(index);
        const isClue = clueRing.has(index);
        const classes = [isZone ? 'safe' : '', isClue ? 'clue' : '', (!isZone && !isClue) ? 'outside-cluster' : ''].filter(Boolean).join(' ');
        const label = isZone ? '·' : (isClue && Number.isInteger(cell?.adj) ? String(cell.adj) : '');
        spans.push(`<span class="${classes}">${label}</span>`);
      }
    }
    return `<div class="online-arena-preview ${arena}"><div class="arena-preview-mark">${ARENA_LABELS[arena]}<small>BÀN ĐẤU ${size}×${size} · BÃI ĐÁP ${opening.length} Ô</small></div><div class="arena-preview-tiles" style="--opening-cols:${cols};--opening-rows:${rows};">${spans.join('')}</div></div>`;
  }

  function showLandingSequence(token) {
    introStage = 'landing';
    const arena = ARENA_SKINS.includes(room?.config?.arenaSkin) ? room.config.arenaSkin : 'arena-standard';
    const configuredSize = Number(room?.config?.boardSize || 0);
    const board = publicState?.board;
    const snapshotMatchesRoom = !!board && Number(board.size) === configuredSize && Array.isArray(board.cells) && board.cells.length === configuredSize * configuredSize;
    if (!snapshotMatchesRoom) {
      landingSyncRetries++;
      const message = landingSyncRetries <= 8
        ? '<div class="online-intro-kicker">ĐỒNG BỘ BẢN ĐỒ</div><h2>ĐANG ĐỒNG BỘ SÀN ĐẤU</h2><p>Đang nhận bản đồ chuẩn từ máy chủ.</p><div class="online-prep-progress"><span></span></div>'
        : '<div class="online-intro-kicker">LỖI ĐỒNG BỘ</div><h2>CHƯA KHỚP BẢN ĐỒ</h2><p>Không thể xác nhận kích thước bàn đấu. Hãy thử đồng bộ lại.</p><button id="retryBoardSync" class="btn btn-primary" style="width:100%">THỬ LẠI</button><button id="onlineIntroLeave" class="btn btn-small" style="width:100%;margin-top:8px">RỜI PHÒNG</button>';
      showOnlineIntro(message);
      $('retryBoardSync')?.addEventListener('click', () => { landingSyncRetries = 0; send('state:request'); showLandingSequence(token); }, { once: true });
      $('onlineIntroLeave')?.addEventListener('click', backHome, { once: true });
      if (landingSyncRetries <= 8) {
        send('state:request');
        introTimer = setTimeout(() => { introTimer = null; if (token === introToken && room?.status === 'playing') showLandingSequence(token); }, 450);
      }
      return;
    }
    landingSyncRetries = 0;
    const size = Number(board.size);
    const mineCount = Number(board.mineCount);
    const zoneCount = Array.isArray(board.zone) ? board.zone.length : 0;
    const clueCount = Array.isArray(board.clueRing) ? board.clueRing.length : 0;
    const openingCount = zoneCount + clueCount;
    showOnlineIntro(
      `<div class="online-intro-kicker">HẠ CÁNH · 02</div>` +
      `<div class="drop-animation online-drop-animation"><div class="pod-shell"></div><div class="pod-window"></div><div class="pod-flame"></div></div><div class="drop-shadow"></div>` +
      landingPreviewMarkup(arena) +
      `<h2>KHOANG ĐÃ HẠ CÁNH</h2>` +
      `<p>BÀN CỜ ${size}×${size} · CỤM ĐÁP ${openingCount} Ô · ${mineCount} MÌN</p>` +
      `<div class="overlay-stats"><div class="stat"><strong>${zoneCount}</strong><span>Ô xuất phát</span></div><div class="stat"><strong>${clueCount}</strong><span>Ô số gợi ý</span></div><div class="stat"><strong>${mineCount}</strong><span>Mìn</span></div></div>` +
      `<button id="onlineLandingContinue" class="btn btn-primary" style="width:100%;margin-top:8px">CHỌN NGƯỜI ĐI TRƯỚC →</button>` +
      `<button id="onlineIntroLeave" class="btn btn-small" style="width:100%;margin-top:8px">RỜI PHÒNG</button>`
    );
    $('onlineLandingContinue')?.addEventListener('click', () => {
      if (introStage !== 'landing') return;
      const button = $('onlineLandingContinue');
      if (send('match:roulette:activate')) {
        if (button) { button.disabled = true; button.textContent = 'ĐANG KÍCH HOẠT ROULETTE…'; }
      }
    });
    $('onlineIntroLeave')?.addEventListener('click', backHome, { once: true });
    // If the other player activated the roulette during this client's landing animation,
    // start immediately after this landing panel appears.
    if (rouletteActivatedByServer) {
      introTimer = setTimeout(() => {
        introTimer = null;
        if (token === introToken && introStage === 'landing') runOnlineRoulette(token);
      }, 350);
    }
  }

  function runOnlineRoulette(token) {
    if (token !== introToken || !room || !publicState || introStage === 'roulette' || introStage === 'done') return;
    if (introTimer) { clearTimeout(introTimer); introTimer = null; }
    introStage = 'roulette';
    const players = room.players.slice();
    const firstId = rouletteStarterId || publicState.turn?.currentPlayerId;
    const firstPlayer = players.find(p => p.id === firstId) || players[0];
    showOnlineIntro(
      `<div class="online-intro-kicker">ROULETTE · 03</div><h2>AI ĐI TRƯỚC?</h2><p>Chọn ngẫu nhiên người đi trước.</p>` +
      `<div id="onlineRouletteCards" class="roulette">${players.map(p=>`<div class="roulette-card" data-player-id="${p.id}"><div class="roulette-avatar" style="background:${p.color}">${({'avatar-cadet':'🎮','avatar-fox':'🦊','avatar-robot':'🤖','avatar-skull':'💀','avatar-astronaut':'👨‍🚀','avatar-crown':'👑'}[p.avatar] || '🎮')}</div>${escapeText(p.name)}</div>`).join('')}</div>` +
      `<div id="onlineRouletteResult" class="online-roulette-result">ĐANG CHỌN NGẪU NHIÊN…</div><button id="onlineIntroLeave" class="btn btn-small" style="width:100%;margin-top:14px">RỜI PHÒNG</button>`
    );
    $('onlineIntroLeave')?.addEventListener('click', backHome, { once: true });
    const cards = [...$('onlineRouletteCards').querySelectorAll('.roulette-card')];
    const targetIndex = Math.max(0, players.findIndex(p => p.id === firstPlayer.id));
    const ticks = 15;
    let step = 0;
    const tick = () => {
      if (token !== introToken || introStage !== 'roulette') return;
      cards.forEach(card => card.classList.remove('active', 'winner'));
      const chosenIndex = step === ticks - 1 ? targetIndex : step % cards.length;
      cards[chosenIndex]?.classList.add(step === ticks - 1 ? 'winner' : 'active');
      step++;
      if (step >= ticks) {
        $('onlineRouletteResult').textContent = `${firstPlayer.name} ĐƯỢC CHỌN ĐI TRƯỚC`;
        introTimer = setTimeout(() => {
          introTimer = null;
          if (token !== introToken || introStage !== 'roulette') return;
          introStage = 'done';
          hideOnlineIntro();
          renderRoom();
          if (publicState?.matchId) send('match:begin', { matchId: publicState.matchId });
          showMessage(`Roulette đã chọn ${firstPlayer.name}. Đang nạp bàn đấu chuẩn của MINEFALL.`);
        }, 950);
        return;
      }
      const delay = 65 + step * 15;
      introTimer = setTimeout(tick, delay);
    };
    tick();
  }

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function currentGamePlayer() {
    return publicState?.players?.find(player => player.id === publicState.turn?.currentPlayerId) || null;
  }

  function ownerFlagCount(playerId) {
    return (publicState?.board?.cells || []).filter(cell => cell.flagOwner === playerId).length;
  }

  function renderOnlineBoard() {
    const root = $('onlineBoard');
    if (!root || !publicState?.board) return;
    const board = publicState.board;
    root.style.setProperty('--online-size', board.size);
    root.style.gridTemplateColumns = `repeat(${board.size}, minmax(0, 1fr))`;
    root.style.gridTemplateRows = `repeat(${board.size}, minmax(0, 1fr))`;
    root.setAttribute('aria-label', `Bản đồ ${board.size} nhân ${board.size}`);
    const activePlayer = currentGamePlayer();
    const playersAt = new Map();
    for (const player of publicState.players || []) {
      if (!Number.isInteger(player.pos) || player.pos < 0) continue;
      if (!playersAt.has(player.pos)) playersAt.set(player.pos, []);
      playersAt.get(player.pos).push(player);
    }
    const frag = document.createDocumentFragment();
    for (const cell of board.cells) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'online-cell'; button.dataset.index = String(cell.i);
      if (cell.zone) button.classList.add('zone', 'revealed');
      else if (cell.revealed || cell.exploded || cell.endRevealed) button.classList.add('revealed');
      else button.classList.add('concealed');
      if (cell.landingClue) button.classList.add('landing-clue');
      if (cell.exploded) button.classList.add('mine', 'exploded');
      if (cell.i === activePlayer?.pos) button.classList.add('selected-target');
      if (cell.flagOwner) {
        button.classList.add('flagged');
        const owner = room?.players?.find(p => p.id === cell.flagOwner);
        button.style.setProperty('--flag-color', owner?.color || '#ffc267');
        if (publicState.ended) button.classList.add(cell.mine === true ? 'flag-correct' : 'flag-wrong');
        button.textContent = publicState.ended && cell.mine === false ? '⚑×' : '⚑';
      } else if (cell.exploded) button.textContent = '💥';
      else if (cell.mine === true) { button.textContent = '✹'; button.classList.add('mine'); }
      else if (cell.revealed && Number(cell.adj) > 0) { button.textContent = String(cell.adj); button.classList.add(`number-${cell.adj}`); }
      else if (cell.zone) button.textContent = '·';

      const occupants = playersAt.get(cell.i) || [];
      if (occupants.length) {
        const stack = document.createElement('span'); stack.className = 'online-pawn-stack';
        for (const occupant of occupants) {
          const playerInfo = room?.players?.find(p => p.id === occupant.id);
          const pawn = document.createElement('span');
          pawn.className = 'online-pawn skin-classic' + (occupant.alive ? '' : ' dead') + (occupant.id === publicState.turn?.currentPlayerId && publicState.started ? ' active' : '');
          pawn.style.setProperty('--pawn-color', occupant.color || playerInfo?.color || '#63e0d5');
          pawn.title = `${occupant.name}${occupant.alive ? '' : ' · đã bị loại'}`;
          if (board.size <= 12) {
            const label = document.createElement('span'); label.className = 'online-pawn-label';
            label.textContent = String(occupant.name || 'P').slice(0, 1).toUpperCase(); pawn.append(label);
          }
          stack.append(pawn);
        }
        button.append(stack);
      }
      button.setAttribute('aria-label', `Ô ${coordinate(cell.i, board.size)}${cell.zone ? ' vùng đáp an toàn' : cell.revealed ? ' đã mở' : ' chưa mở'}${occupants.length ? ', nhân vật ' + occupants.map(p => p.name).join(', ') : ''}`);
      button.addEventListener('click', () => moveToCell(cell.i));
      frag.append(button);
    }
    root.replaceChildren(frag);
  }

  function sendGameCommand(type, index) {
    if (!connectedSocket() || !publicState || !room) {
      showMessage('Không có kết nối hoặc trạng thái trận.', true); return false;
    }
    const state = publicState;
    const player = state.players?.find(item => item.id === selfPlayerId);
    if (!state.started || state.ended || state.status !== 'playing') {
      showMessage('Trận chưa bắt đầu hoặc đã kết thúc.', true); return false;
    }
    if (!player?.alive || state.turn?.currentPlayerId !== selfPlayerId) {
      showMessage('Chưa đến lượt của bạn.', true); return false;
    }
    if (socket.bufferedAmount > 256 * 1024) {
      showMessage('Kết nối đang bận. Thử lại sau giây lát.', true);
      return false;
    }
    const commandId = `${state.matchId}:${selfPlayerId}:${++commandSequence}`;
    const command = {
      protocolVersion: 1, type, playerId: selfPlayerId, matchId: state.matchId,
      turnId: Number(state.turn?.turnId || 0), commandId, payload: { index }
    };
    try {
      socket.send(JSON.stringify({ type: 'game:command', command }));
      if (commandWatchdog) clearTimeout(commandWatchdog);
      commandWatchdog = setTimeout(() => {
        commandWatchdog = null;
        if (!window.MINEFALL_APP?.isOnlineActionPending?.()) return;
        if (send('state:request')) {
          commandWatchdog = setTimeout(() => {
            commandWatchdog = null;
            if (window.MINEFALL_APP?.isOnlineActionPending?.()) {
              window.MINEFALL_APP.onlineCommandRejected('Phản hồi bị chậm. Hãy thử lại.');
            }
          }, 3500);
        } else if (window.MINEFALL_APP?.isOnlineActionPending?.()) {
          window.MINEFALL_APP.onlineCommandRejected('Mất kết nối. Hãy kết nối lại.');
        }
      }, 5000);
      return true;
    } catch {
      showMessage('Không gửi được nước đi.', true);
      return false;
    }
  }

  function moveToCell(index) {
    if (!publicState || !room) return;
    const me = publicState.players?.find(player => player.id === selfPlayerId);
    if (!publicState.started || publicState.ended) {
      showMessage('Đợi roulette kết thúc trước khi di chuyển.', true); return;
    }
    if (!me?.alive || publicState.turn?.currentPlayerId !== selfPlayerId) {
      showMessage('Đang là lượt của người chơi khác. Bạn vẫn có thể quan sát bản đồ.', true); return;
    }
    sendGameCommand('MOVE', index);
    const cell = publicState.board.cells[index];
    if (cell?.zone) $('onlineActionNote').textContent = 'Đang đứng trong vùng đáp an toàn. Hãy di chuyển đến một ô chưa mở để đào hoặc đặt/gỡ cờ.';
    else if (cell?.revealed) $('onlineActionNote').textContent = 'Ô này đã mở. Di chuyển đến một ô chưa mở khác.';
    else if (cell?.flagOwner) $('onlineActionNote').textContent = 'Ô này có cờ. Nút hành động sẽ gỡ cờ của chủ sở hữu hiện tại.';
    else $('onlineActionNote').textContent = `Đã chọn ô ${coordinate(index, publicState.board.size)}. Chọn ĐÀO hoặc CẮM CỜ để kết thúc lượt.`;
  }

  function performOnlineAction(type) {
    if (!publicState || !room) return;
    const me = publicState.players?.find(player => player.id === selfPlayerId);
    if (!me?.alive || !publicState.started || publicState.ended || publicState.turn?.currentPlayerId !== selfPlayerId) {
      showMessage('Chỉ người đang có lượt mới được hành động.', true); return;
    }
    const index = me.pos;
    const cell = publicState.board.cells[index];
    if (!cell) { showMessage('Di chuyển đến một ô trước.', true); return; }
    if (cell.zone) { showMessage('Ô xuất phát trong bãi đáp an toàn không thể đào hoặc cắm cờ.', true); return; }
    if (cell.revealed) { showMessage('Ô này đã mở. Di chuyển đến ô chưa mở khác.', true); return; }
    if (type === 'DIG' && cell.flagOwner) { showMessage('Ô đang có cờ. Hãy gỡ cờ trước.', true); return; }
    if (type !== 'DIG' && cell.flagOwner && cell.flagOwner !== selfPlayerId) { showMessage('Đấu cờ tiêu chuẩn không cho phép gỡ cờ đối thủ; tính năng này dành cho chế độ Hỗn loạn.', true); return; }
    const commandType = type === 'DIG' ? 'DIG' : (cell.flagOwner ? 'UNFLAG' : 'FLAG');
    sendGameCommand(commandType, index);
  }

  function formatClock(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    return `${Math.floor(value / 60).toString().padStart(2, '0')}:${Math.floor(value % 60).toString().padStart(2, '0')}`;
  }

  function renderOnlineControls() {
    if (!publicState || !room) return;
    const state = publicState;
    const active = state.players?.find(player => player.id === state.turn?.currentPlayerId);
    const me = state.players?.find(player => player.id === selfPlayerId);
    const cell = me && Number.isInteger(me.pos) ? state.board.cells[me.pos] : null;
    const isMyTurn = !!(state.started && !state.ended && me?.alive && active?.id === selfPlayerId);
    $('onlineTurnPlayer').textContent = active ? `${active.name}${active.alive ? '' : ' · ĐÃ BỊ LOẠI'}` : 'Không có lượt';
    $('onlineTurnPlayer').style.color = active?.color || 'var(--text)';
    $('onlineTurnClock').textContent = state.ended ? '00s' : `${Math.max(0, Number(state.turn?.secondsLeft) || 0).toString().padStart(2, '0')}s`;
    $('onlineMatchClock').textContent = formatClock(state.matchSecondsLeft);
    const canActOnCell = !!(isMyTurn && cell && !cell.zone && !cell.revealed);
    $('onlineDigBtn').disabled = !canActOnCell || !!cell?.flagOwner;
    $('onlineFlagBtn').disabled = !canActOnCell || !!(cell?.flagOwner && cell.flagOwner !== selfPlayerId);
    $('onlineFlagBtn').textContent = cell?.flagOwner ? '⚑ GỠ CỜ' : '⚑ CẮM CỜ';
    $('onlineReturnLobbyBtn').classList.toggle('online-hidden', !state.ended);
    if (state.ended) $('onlineActionNote').textContent = 'Trận đã kết thúc. Tất cả cờ còn trên bàn được tính cho đúng chủ sở hữu, kể cả người đã bị loại.';
    else if (!state.started) $('onlineActionNote').textContent = 'Đợi chuỗi chuẩn bị sàn, hạ cánh và roulette kết thúc.';
    else if (!me?.alive) $('onlineActionNote').textContent = 'Bạn đã bị loại. Bạn vẫn có thể quan sát các lượt còn lại và bảng kết quả.';
    else if (!isMyTurn) $('onlineActionNote').textContent = `Đang chờ ${active?.name || 'người chơi hiện tại'} hành động. Bạn có thể quan sát, nhưng không thể di chuyển.`;
    else if (!cell) $('onlineActionNote').textContent = 'Nhấp vào một ô để di chuyển nhân vật đến đó.';
    else if (cell.zone) $('onlineActionNote').textContent = 'Ô xuất phát trong bãi đáp an toàn. Di chuyển đến ô chưa mở bên ngoài cụm đáp để hành động.';
    else if (cell.revealed) $('onlineActionNote').textContent = 'Ô này đã mở. Hãy di chuyển đến ô chưa mở.';
    else if (cell.flagOwner) $('onlineActionNote').textContent = cell.flagOwner===selfPlayerId ? 'Ô này có cờ của bạn. Có thể gỡ để sửa dự đoán.' : 'Ô này có cờ của đối thủ. Đấu cờ tiêu chuẩn không cho phép gỡ cờ đối thủ; tính năng này dành cho chế độ Hỗn loạn.';
    else $('onlineActionNote').textContent = `Nhân vật đang ở ${coordinate(me.pos, state.board.size)}. Đào hoặc cắm cờ sẽ kết thúc lượt.`;
  }

  function renderMiniPlayers() {
    const root = $('onlineMiniPlayers'); if (!root || !room) return;
    root.replaceChildren();
    for (const player of room.players) {
      const gamePlayer = publicState?.players?.find(p => p.id === player.id);
      const card = document.createElement('div');
      card.className = 'online-mini-player' + (gamePlayer && !gamePlayer.alive ? ' eliminated' : '');
      const top = document.createElement('div'); top.className = 'online-mini-player-top';
      const color = document.createElement('span'); color.className = 'online-mini-color'; color.style.background = player.color;
      const name = document.createElement('span'); name.textContent = player.name + (player.id === selfPlayerId ? ' (bạn)' : '');
      top.append(color, name);
      const small = document.createElement('small');
      if (!gamePlayer) small.textContent = player.connected ? (player.ready ? 'Sẵn sàng' : 'Đang chờ') : 'Mất kết nối';
      else {
        const flags = ownerFlagCount(player.id);
        const status = gamePlayer.alive ? (publicState.turn?.currentPlayerId === player.id ? 'ĐANG ĐI' : 'CÒN SỐNG') : `ĐÃ BỊ LOẠI · HẠNG ${gamePlayer.place ?? '—'}`;
        const cursor = Number.isInteger(gamePlayer.pos) ? ` · ${coordinate(gamePlayer.pos, publicState.board.size)}` : '';
        const score = publicState.ended ? ` · cờ đúng ${gamePlayer.correctFlags || 0} / sai ${gamePlayer.wrongFlags || 0} · điểm cờ ${(gamePlayer.flagScore || 0) > 0 ? '+' : ''}${gamePlayer.flagScore || 0}` : '';
        small.textContent = `${status}${cursor} · ${flags} cờ trên bàn${score}`;
      }
      card.append(top, small); root.append(card);
    }
  }

  function renderOnlineResults() {
    const root = $('onlineResultsPanel');
    if (!root || !publicState?.ended || !publicState.results) {
      root?.classList.add('online-hidden');
      if (root) root.replaceChildren();
      return;
    }
    root.classList.remove('online-hidden');
    const results = publicState.results.players || [];
    const byId = new Map((publicState.players || []).map(player => [player.id, player]));
    const reasonTitle = publicState.endReason === 'survivor' ? '👑 NGƯỜI SỐNG SÓT CUỐI CÙNG' : publicState.endReason === 'everyone-eliminated' ? 'KHÔNG CÒN AI SỐNG' : 'HẾT THỜI GIAN TRẬN';
    let markup = `<div class="online-results-head"><div><div class="eyebrow">KẾT QUẢ TRẬN</div><h3>${reasonTitle}</h3><p>${escapeText(publicState.scoreNote || 'Điểm cờ của mọi người được tính khi tổng kết.')}</p></div><div class="online-results-note">Cờ đúng +1 · Cờ sai −1<br>Điểm tổng = điểm hạng + điểm cờ − phạt lượt</div></div>`;
    markup += '<div class="online-results-table-wrap"><table class="online-results-table"><thead><tr><th>Hạng</th><th>Người chơi</th><th>Trạng thái</th><th>Cờ đúng / sai</th><th>Điểm cờ</th><th>Điểm hạng</th><th>Phạt</th><th>Tổng điểm</th></tr></thead><tbody>';
    for (const result of [...results].sort((a,b) => (a.place || 99) - (b.place || 99))) {
      const player = byId.get(result.id);
      const score = Number(result.totalScore) || 0;
      const flag = Number(result.flagScore) || 0;
      markup += `<tr><td><b>${result.place ?? '—'}</b></td><td><span class="online-result-player"><i style="background:${player?.color || '#63e0d5'}"></i>${escapeText(player?.name || result.id)}</span></td><td>${player?.alive ? 'Sống' : 'Đã bị loại'}</td><td>${result.correctFlags || 0} / ${result.wrongFlags || 0}</td><td>${flag > 0 ? '+' : ''}${flag}</td><td>+${Number(result.rankPoints) || 0}</td><td>−${Number(result.skipPenalty) || 0}</td><td class="online-result-total ${score < 0 ? 'negative' : 'positive'}">${score > 0 ? '+' : ''}${score}</td></tr>`;
    }
    markup += '</tbody></table></div><div class="online-footer-note">Số cờ tính theo các lá cờ vẫn còn trên bàn ở thời điểm kết thúc. Cờ của người đã bị loại không bị xóa và vẫn được tính cho họ.</div>';
    root.innerHTML = markup;
  }

  function updateOnlineEvent() {
    const event = publicState?.lastEvent;
    if (!event || !event.type) return;
    const stamp = `${event.type}:${event.at || ''}:${event.playerId || ''}:${event.index ?? ''}:${event.turnId ?? ''}`;
    if (stamp === lastEventStamp) return;
    lastEventStamp = stamp;
    const person = (publicState.players || []).find(p => p.id === event.playerId);
    const name = person?.name || room?.players?.find(p => p.id === event.playerId)?.name || 'Người chơi';
    const index = Number.isInteger(event.index) ? coordinate(event.index, publicState.board.size) : '';
    const messages = {
      move: `${name} di chuyển đến ${index}.`,
      dig: `${name} đào ${index} và mở ${event.openedCount || 1} ô an toàn.`,
      flag: `${name} cắm cờ tại ${index}.`,
      unflag: `${name} gỡ cờ tại ${index}.`,
      eliminated: `${name} đào trúng mìn tại ${index} và bị loại.`,
      'turn-timeout': `${name} hết giờ lượt. Phạt −${5} điểm, lượt được chuyển tiếp.`,
      'turn-started': `Lượt ${event.turnId || publicState.turn?.turnId}: ${name} đang đi.`,
      'match-ended': `Trận kết thúc: ${publicState.endReason || 'đã hoàn tất'}.`,
      'match-began': `Trận bắt đầu. ${name} được đi trước.`
    };
    $('onlineSyncLog').textContent = messages[event.type] || `Sự kiện: ${event.type}.`;
  }

  $('onlineBoardSize')?.addEventListener('change', () => {
    const size = Number($('onlineBoardSize').value);
    window.MINEFALL_APP?.syncConfigFromOnline?.({ boardSize: size, matchDurationMinutes: room?.config?.matchDurationMinutes || 10 });
  });
  $('onlineDifficulty')?.addEventListener('change', () => {
    const difficulty = $('onlineDifficulty').value;
    window.MINEFALL_APP?.syncConfigFromOnline?.({ difficulty });
  });
  $('onlineMenuBtn')?.addEventListener('click', openOnlineScreen);
  $('onlineBackBtn')?.addEventListener('click', backHome);
  $('onlineRoomHomeBtn')?.addEventListener('click', backHome);
  $('onlineCreateBtn')?.addEventListener('click', createRoom);
  $('onlineJoinBtn')?.addEventListener('click', joinRoom);
  $('onlineReadyBtn')?.addEventListener('click', () => {
    const me = room?.players?.find(p => p.id === selfPlayerId);
    if (!me) return;
    send('player:ready', { ready: !me.ready });
  });
  $('onlineStartBtn')?.addEventListener('click', () => send('match:start'));
  $('onlineRequestStateBtn')?.addEventListener('click', () => send('state:request'));
  $('onlineDigBtn')?.addEventListener('click', () => performOnlineAction('DIG'));
  $('onlineFlagBtn')?.addEventListener('click', () => performOnlineAction('FLAG'));
  $('onlineReturnLobbyBtn')?.addEventListener('click', () => send('match:return'));
  $('onlineLeaveBtn')?.addEventListener('click', () => send('room:leave'));
  $('onlineCopyCodeBtn')?.addEventListener('click', async () => {
    if (!room?.code) return;
    try { await navigator.clipboard.writeText(room.code); showMessage(`Đã sao chép mã phòng ${room.code}.`); }
    catch { $('onlineJoinCode').value = room.code; $('onlineJoinCode').focus(); $('onlineJoinCode').select(); showMessage('Không cấp quyền clipboard; mã đã được chọn để sao chép thủ công.'); }
  });
  $('onlineJoinCode')?.addEventListener('input', event => { event.target.value = event.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6); });

  // Give the default local profile a distinct label for two-browser room tests.
  if ($('onlinePlayerName') && $('onlinePlayerName').value === 'Người chơi') { $('onlinePlayerName').value = 'Người chơi ' + (100 + Math.floor(Math.random() * 900)); }

  // An online lobby only connects when the user opens it; offline play never depends on a server.
  updateHostArenaPreview(getLocalEquippedArena(), 'Sàn dùng khi bạn tạo phòng');
  updateHostBombPreview(getLocalCosmetics().bomb, 'Mìn nổ dùng khi bạn tạo phòng');
  setConnectionStatus(location.protocol === 'file:' ? 'Cần chạy server' : 'Chưa kết nối');
  window.MINEFALL_ONLINE = Object.freeze({
    sendCommand: sendGameCommand,
    sendEmote: (emoji, caption) => send('game:emote', { emoji, caption }),
    returnToLobby: () => send('match:return'),
    requestRematch: () => send('match:rematch'),
    getRematchStatus: () => room?.rematch || null,
    leaveToHome: backHome,
    requestState: () => send('state:request'),
    refreshCosmeticPreviews
  });
})();
