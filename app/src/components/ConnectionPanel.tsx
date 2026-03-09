import { Field, Panel } from "./chrome";

interface ConnectionPanelProps {
  wsUrl: string;
  clientToken: string;
  deviceId: string;
  pairingCode: string;
  pairingMessage: string;
  pairingPending: boolean;
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
}

export function ConnectionPanel(props: ConnectionPanelProps) {
  const connected = props.connectionPhase === "connected";

  return (
    <Panel title="连接">
      <div className="space-y-3">
        <Field label="WebSocket 地址" value={props.wsUrl} onChange={props.onWsUrlChange} />
        <Field label="访问令牌" value={props.clientToken} onChange={props.onClientTokenChange} />
        <Field label="设备 ID" value={props.deviceId} onChange={props.onDeviceIdChange} />
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
          <p className="text-sm font-medium text-white">设备配对</p>
          <p className="mt-1 text-xs text-slate-500">
            电脑上执行 `pnpm agent:pair` 获取一次性配对码，手机输入后会自动换取设备访问令牌。
          </p>
          <div className="mt-3 flex gap-3">
            <input
              className="flex-1 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm uppercase outline-none placeholder:text-slate-500"
              value={props.pairingCode}
              onChange={(event) => props.onPairingCodeChange(event.target.value)}
              placeholder="ABC-234"
            />
            <button
              className="rounded-full bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 disabled:opacity-60"
              type="button"
              disabled={props.pairingPending}
              onClick={props.onRedeemPairingCode}
            >
              {props.pairingPending ? "配对中" : "配对"}
            </button>
          </div>
          {props.pairingMessage ? <p className="mt-2 text-xs text-slate-400">{props.pairingMessage}</p> : null}
        </div>
        <div className="flex gap-3">
          <button
            className="flex-1 rounded-full bg-sky-500 px-4 py-2.5 text-sm font-medium text-slate-950 disabled:opacity-60"
            disabled={props.connectionPhase === "connecting"}
            onClick={props.onConnect}
          >
            {connected ? "重新连接" : props.connectionPhase === "connecting" ? "连接中" : "连接"}
          </button>
          <button className="rounded-full border border-slate-700 px-4 py-2.5 text-sm text-slate-200" onClick={props.onRefresh}>
            刷新
          </button>
          <button className="rounded-full border border-slate-700 px-4 py-2.5 text-sm text-slate-200" onClick={props.onDisconnect}>
            断开
          </button>
        </div>
        <button
          className="w-full rounded-full border border-rose-500/40 px-4 py-2.5 text-sm text-rose-200"
          type="button"
          onClick={props.onClearBinding}
        >
          清除本机绑定
        </button>
        <button
          className="w-full rounded-full border border-slate-700 px-4 py-2.5 text-sm text-slate-200"
          type="button"
          onClick={props.onToggleNotifications}
        >
          {props.notificationsEnabled ? "关闭浏览器提醒" : "开启浏览器提醒"}
        </button>
        <p className="text-xs text-slate-500">
          断线后会自动重连。连接参数、访问令牌和最近查看的会话会保存在本机浏览器里。
        </p>
      </div>
    </Panel>
  );
}
