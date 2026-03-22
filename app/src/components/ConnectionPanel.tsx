import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY, Field, Panel } from "./chrome";

interface ConnectionPanelProps {
  title?: string;
  wsUrl: string;
  wsUrlValid: boolean;
  clientToken: string;
  deviceId: string;
  deviceIdEditable: boolean;
  pairingCode: string;
  pairingMessage: string;
  pairingPending: boolean;
  pairingInitializing: boolean;
  agentFingerprint?: string;
  connectionPhase: "idle" | "connecting" | "connected" | "reconnecting";
  notificationsEnabled: boolean;
  onWsUrlChange: (value: string) => void;
  onClientTokenChange: (value: string) => void;
  onDeviceIdChange: (value: string) => void;
  onPairingCodeChange: (value: string) => void;
  onRedeemPairingCode: () => void;
  onConnect: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
  onClearBinding: () => void;
  onToggleNotifications: () => void;
  showConnectionFields?: boolean;
  showPairingSection?: boolean;
  showActions?: boolean;
}

export function ConnectionPanel(props: ConnectionPanelProps) {
  const connected = props.connectionPhase === "connected";
  const showConnectionFields = props.showConnectionFields ?? true;
  const showPairingSection = props.showPairingSection ?? true;
  const showActions = props.showActions ?? true;

  return (
    <Panel title={props.title ?? "连接"}>
      <div className="space-y-3">
        {showConnectionFields ? (
          <>
            <Field label="WebSocket 地址" value={props.wsUrl} onChange={props.onWsUrlChange} />
            <Field
              label="设备访问令牌"
              value={props.clientToken}
              onChange={props.onClientTokenChange}
              placeholder="首次配对后会自动写入"
              type="password"
              autoComplete="off"
            />
            <Field label="设备 ID" value={props.deviceId} onChange={props.onDeviceIdChange} disabled={!props.deviceIdEditable} />
            {props.agentFingerprint ? (
              <div className="rounded-[16px] border border-[var(--tp-border-soft)] bg-[color:var(--tp-surface-2)] px-3 py-3">
                <p className="tp-label">设备指纹</p>
                <p className="mt-2 text-sm font-medium tracking-[0.18em] text-[var(--tp-text)]">{props.agentFingerprint}</p>
                <p className="mt-2 text-xs text-[var(--tp-text-soft)]">配对或复核设备身份时，请和电脑端输出的指纹进行核对。</p>
              </div>
            ) : null}
          </>
        ) : null}
        {showPairingSection ? (
          <div className="tp-card-muted p-3">
            <p className="text-sm font-medium text-[var(--tp-text)]">设备配对</p>
            <p className="mt-1 text-xs text-[var(--tp-text-soft)]">
              电脑上执行 `termpilot agent --relay 你的 relay 地址`。命令会直接启动后台 agent，并打印一次性配对码和设备指纹。
            </p>
            <div className="mt-3 flex gap-3">
              <input
                className="tp-input flex-1 uppercase"
                value={props.pairingCode}
                onChange={(event) => props.onPairingCodeChange(event.target.value)}
                placeholder="ABC-234"
              />
              <button
                className={BUTTON_PRIMARY}
                type="button"
                disabled={props.pairingPending || props.pairingInitializing || !props.wsUrlValid}
                onClick={props.onRedeemPairingCode}
              >
                {props.pairingPending ? "配对中" : props.pairingInitializing ? "初始化中" : "配对"}
              </button>
            </div>
            {props.pairingMessage || props.pairingInitializing ? (
              <p className="mt-2 text-xs text-[var(--tp-text-muted)]">
                {props.pairingMessage || "正在初始化本地配对密钥…"}
              </p>
            ) : null}
          </div>
        ) : null}
        {showActions ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <button
                className={`${connected ? BUTTON_SECONDARY : BUTTON_PRIMARY} w-full`}
                disabled={props.connectionPhase === "connecting" || !props.wsUrlValid}
                onClick={props.onConnect}
              >
                {connected ? "重新连接" : props.connectionPhase === "connecting" ? "连接中" : "连接"}
              </button>
              <button
                className={`${BUTTON_SECONDARY} w-full`}
                disabled={!connected}
                onClick={props.onRefresh}
              >
                刷新
              </button>
              <button
                className={`${BUTTON_SECONDARY} w-full`}
                disabled={props.connectionPhase === "idle"}
                onClick={props.onDisconnect}
              >
                断开
              </button>
            </div>
            <button
              className={`${BUTTON_DANGER} w-full`}
              type="button"
              onClick={props.onClearBinding}
            >
              清除本机绑定
            </button>
            <button
              className={`${BUTTON_SECONDARY} w-full`}
              type="button"
              onClick={props.onToggleNotifications}
            >
              {props.notificationsEnabled ? "关闭浏览器提醒" : "开启浏览器提醒"}
            </button>
            <p className="text-xs text-[var(--tp-text-soft)]">
              断线后会自动重连。连接参数、设备访问令牌和最近查看的会话会保存在本机浏览器里。
            </p>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
