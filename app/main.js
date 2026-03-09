(function () {
  const state = {
    socket: null,
    sessions: [],
    activeSid: null,
    buffers: new Map(),
    deviceOnline: false,
  };

  const relayStatus = document.getElementById("relay-status");
  const deviceStatus = document.getElementById("device-status");
  const wsUrlInput = document.getElementById("ws-url");
  const clientTokenInput = document.getElementById("client-token");
  const deviceIdInput = document.getElementById("device-id");
  const connectButton = document.getElementById("connect-button");
  const refreshButton = document.getElementById("refresh-button");
  const createForm = document.getElementById("create-form");
  const sessionList = document.getElementById("session-list");
  const terminalOutput = document.getElementById("terminal-output");
  const inputForm = document.getElementById("input-form");
  const inputText = document.getElementById("input-text");
  const activeTitle = document.getElementById("active-title");

  const createName = document.getElementById("create-name");
  const createCwd = document.getElementById("create-cwd");
  const createShell = document.getElementById("create-shell");

  wsUrlInput.value = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

  function createReqId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function setRelayStatus(connected) {
    relayStatus.textContent = connected ? "已连接" : "未连接";
    relayStatus.className = `status ${connected ? "online" : "offline"}`;
  }

  function setDeviceStatus(online) {
    state.deviceOnline = online;
    deviceStatus.textContent = online ? "设备在线" : "设备离线";
    deviceStatus.className = `status ${online ? "online" : "offline"}`;
  }

  function getActiveSession() {
    return state.sessions.find((session) => session.sid === state.activeSid) || null;
  }

  function renderActiveSession() {
    const session = getActiveSession();
    if (!session) {
      activeTitle.textContent = "当前未选择会话";
      terminalOutput.textContent = "";
      return;
    }

    activeTitle.textContent = `${session.name} (${session.status === "running" ? "运行中" : "已退出"})`;
    terminalOutput.textContent = state.buffers.get(session.sid) || "";
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }

  function renderSessions() {
    sessionList.innerHTML = "";

    if (state.sessions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "当前没有会话";
      sessionList.appendChild(empty);
      renderActiveSession();
      return;
    }

    state.sessions
      .slice()
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .forEach((session) => {
        const item = document.createElement("div");
        item.className = `session-item ${session.sid === state.activeSid ? "active" : ""}`;

        const meta = document.createElement("div");
        meta.className = "session-meta";
        meta.innerHTML = `
          <strong>${session.name}</strong>
          <span>${session.sid.slice(0, 8)} · ${session.status === "running" ? "运行中" : "已退出"}</span>
          <span>${session.cwd}</span>
        `;

        const actions = document.createElement("div");
        actions.className = "session-actions";

        const attachButton = document.createElement("button");
        attachButton.className = "button";
        attachButton.textContent = "查看";
        attachButton.onclick = () => {
          state.activeSid = session.sid;
          renderSessions();
          requestReplay(session.sid);
        };

        const killButton = document.createElement("button");
        killButton.className = "button danger";
        killButton.textContent = "关闭";
        killButton.disabled = session.status !== "running";
        killButton.onclick = () => {
          sendMessage({
            type: "session.kill",
            reqId: createReqId("kill"),
            deviceId: deviceIdInput.value.trim(),
            sid: session.sid,
          });
        };

        actions.appendChild(attachButton);
        actions.appendChild(killButton);
        item.appendChild(meta);
        item.appendChild(actions);
        sessionList.appendChild(item);
      });

    renderActiveSession();
  }

  function sendMessage(message) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
      window.alert("WebSocket 尚未连接。");
      return;
    }
    state.socket.send(JSON.stringify(message));
  }

  function requestSessions() {
    sendMessage({
      type: "session.list",
      reqId: createReqId("list"),
      deviceId: deviceIdInput.value.trim(),
    });
  }

  function requestReplay(sid) {
    sendMessage({
      type: "session.replay",
      reqId: createReqId("replay"),
      deviceId: deviceIdInput.value.trim(),
      sid,
      payload: {
        afterSeq: -1,
      },
    });
  }

  function connect() {
    if (state.socket) {
      state.socket.close();
    }

    const wsUrl = new URL(wsUrlInput.value.trim());
    wsUrl.searchParams.set("role", "client");
    wsUrl.searchParams.set("token", clientTokenInput.value.trim());

    const socket = new WebSocket(wsUrl);
    state.socket = socket;

    socket.addEventListener("open", () => {
      setRelayStatus(true);
      requestSessions();
    });

    socket.addEventListener("close", () => {
      setRelayStatus(false);
      setDeviceStatus(false);
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case "auth.ok":
          return;
        case "relay.state": {
          const online = message.payload.agents.some(
            (agent) => agent.deviceId === deviceIdInput.value.trim() && agent.online,
          );
          setDeviceStatus(online);
          return;
        }
        case "session.list.result":
          if (message.deviceId !== deviceIdInput.value.trim()) {
            return;
          }
          state.sessions = message.payload.sessions;
          if (!state.activeSid && state.sessions[0]) {
            state.activeSid = state.sessions[0].sid;
          }
          renderSessions();
          if (state.activeSid) {
            requestReplay(state.activeSid);
          }
          return;
        case "session.created":
        case "session.state": {
          const nextSession =
            message.type === "session.created"
              ? message.payload.session
              : message.payload.session;
          const nextList = state.sessions.filter((session) => session.sid !== nextSession.sid);
          nextList.push(nextSession);
          state.sessions = nextList;
          if (!state.activeSid) {
            state.activeSid = nextSession.sid;
          }
          renderSessions();
          return;
        }
        case "session.output":
          if (message.deviceId !== deviceIdInput.value.trim()) {
            return;
          }
          state.buffers.set(message.sid, message.payload.data);
          if (state.activeSid === message.sid) {
            renderActiveSession();
          }
          return;
        case "session.exit": {
          const session = state.sessions.find((item) => item.sid === message.sid);
          if (session) {
            session.status = "exited";
          }
          renderSessions();
          return;
        }
        case "error":
          window.alert(message.message);
      }
    });
  }

  connectButton.addEventListener("click", connect);
  refreshButton.addEventListener("click", requestSessions);

  createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage({
      type: "session.create",
      reqId: createReqId("create"),
      deviceId: deviceIdInput.value.trim(),
      payload: {
        name: createName.value.trim() || undefined,
        cwd: createCwd.value.trim() || undefined,
        shell: createShell.value.trim() || undefined,
      },
    });
    createName.value = "";
  });

  inputForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.activeSid) {
      window.alert("请先选择一个会话。");
      return;
    }

    sendMessage({
      type: "session.input",
      reqId: createReqId("input"),
      deviceId: deviceIdInput.value.trim(),
      sid: state.activeSid,
      payload: {
        text: `${inputText.value}\n`,
      },
    });

    inputText.value = "";
  });

  document.querySelectorAll("[data-key]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.activeSid) {
        window.alert("请先选择一个会话。");
        return;
      }

      sendMessage({
        type: "session.input",
        reqId: createReqId("key"),
        deviceId: deviceIdInput.value.trim(),
        sid: state.activeSid,
        payload: {
          key: button.getAttribute("data-key"),
        },
      });
    });
  });
})();
