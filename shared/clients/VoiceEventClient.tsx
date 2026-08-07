/**
 * Voice Events Real-Time Client
 * 
 * Connects to the backend SSE stream for live call event updates.
 * Provides type-safe event handling and automatic reconnection.
 */

import { NormalizedVoiceEvent, RealtimeCallEvent } from '../contracts/voice-events';

export interface VoiceEventStreamConfig {
  tenantId: string;
  baseUrl?: string;
  adminKey?: string;
  onEvent?: (event: RealtimeCallEvent) => void;
  onHeartbeat?: (timestamp: string) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export interface CallMonitorState {
  callId: string;
  status: 'initiated' | 'connected' | 'active' | 'completed' | 'failed';
  stage: string;
  events: RealtimeCallEvent[];
  analysis?: {
    outcome: string;
    confidence: number;
    lead?: {
      propertyType?: string;
      location?: string;
      budget?: string;
      timeline?: string;
    };
  };
  transcript?: Array<{
    speaker: 'agent' | 'person';
    text: string;
    sequenceNo: number;
  }>;
  error?: string;
}

/**
 * Establishes SSE connection to realtime call stream
 */
export class VoiceEventClient {
  private eventSource: EventSource | null = null;
  private config: Required<VoiceEventStreamConfig>;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: VoiceEventStreamConfig) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:4000',
      autoReconnect: config.autoReconnect ?? true,
      reconnectDelay: config.reconnectDelay ?? 3000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      onEvent: config.onEvent || (() => {}),
      onHeartbeat: config.onHeartbeat || (() => {}),
      onError: config.onError || (() => {}),
      onClose: config.onClose || (() => {}),
      tenantId: config.tenantId,
      adminKey: config.adminKey,
    };
  }

  /**
   * Connect to SSE stream
   */
  public connect(): void {
    if (this.eventSource) {
      return; // Already connected
    }

    const params = new URLSearchParams({
      tenantId: this.config.tenantId,
      ...(this.config.adminKey && { adminKey: this.config.adminKey }),
    });

    const url = `${this.config.baseUrl}/api/realtime/calls/stream?${params.toString()}`;

    this.eventSource = new EventSource(url);

    // Connection established
    this.eventSource.addEventListener('connected', (e: Event) => {
      const event = e as MessageEvent;
      console.log('[VoiceEvents] Connected:', JSON.parse(event.data));
      this.reconnectAttempts = 0;
    });

    // Incoming call event
    this.eventSource.addEventListener('call_event', (e: Event) => {
      const event = e as MessageEvent;
      try {
        const callEvent = JSON.parse(event.data) as RealtimeCallEvent;
        this.config.onEvent(callEvent);
      } catch (err) {
        this.config.onError(new Error(`Failed to parse call event: ${err}`));
      }
    });

    // Periodic heartbeat (keep-alive)
    this.eventSource.addEventListener('heartbeat', (e: Event) => {
      const event = e as MessageEvent;
      try {
        const { ts } = JSON.parse(event.data) as { ts: string };
        this.config.onHeartbeat(ts);
      } catch (err) {
        // Silently ignore heartbeat parse errors
      }
    });

    // Connection error
    this.eventSource.addEventListener('error', () => {
      this.handleConnectionError();
    });

    // Also attach to onerror for other error types
    this.eventSource.onerror = () => {
      this.handleConnectionError();
    };
  }

  /**
   * Disconnect from SSE stream
   */
  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.config.onClose();
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }

  /**
   * Handle connection errors with exponential backoff
   */
  private handleConnectionError(): void {
    this.eventSource?.close();
    this.eventSource = null;

    if (!this.config.autoReconnect) {
      this.config.onError(new Error('Connection lost'));
      this.config.onClose();
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.config.onError(
        new Error(`Failed to reconnect after ${this.config.maxReconnectAttempts} attempts`)
      );
      this.config.onClose();
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `[VoiceEvents] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

/**
 * React Hook for voice event streaming
 */
export function useVoiceEventStream(config: VoiceEventStreamConfig) {
  const [state, setState] = React.useState<CallMonitorState | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [isConnected, setIsConnected] = React.useState(false);
  const clientRef = React.useRef<VoiceEventClient | null>(null);

  React.useEffect(() => {
    const client = new VoiceEventClient({
      ...config,
      onEvent: (event: RealtimeCallEvent) => {
        setState((prevState) => {
          const newState: CallMonitorState = prevState || {
            callId: event.callId,
            status: 'initiated',
            stage: event.stage,
            events: [],
          };

          // Update call state
          newState.status = event.callState as any;
          newState.stage = event.stage;
          newState.events = [...newState.events, event];

          // Extract transcript
          if (event.eventType === 'call_transcript_final' && event.payload) {
            const payload = event.payload as any;
            if (payload.turns) {
              newState.transcript = payload.turns;
            }
          }

          // Extract analysis and lead data
          if (event.eventType === 'call_analysis_completed' && event.payload) {
            const payload = event.payload as any;
            newState.analysis = {
              outcome: payload.call_outcome,
              confidence: payload.confidence,
              lead: payload.lead,
            };
          }

          // Capture errors
          if (event.eventType === 'call_failed' && event.payload) {
            const payload = event.payload as any;
            newState.error = payload.error;
          }

          return newState;
        });

        config.onEvent?.(event);
      },
      onError: (err: Error) => {
        setError(err);
        config.onError?.(err);
      },
      onClose: () => {
        setIsConnected(false);
        config.onClose?.();
      },
    });

    clientRef.current = client;
    client.connect();
    setIsConnected(true);

    return () => {
      client.disconnect();
    };
  }, [config.tenantId]);

  return {
    state,
    error,
    isConnected,
  };
}

/**
 * Call Monitor Component (React)
 * 
 * Example usage:
 * ```
 * <CallMonitor tenantId={tenantId} callId={callId} />
 * ```
 */
export function CallMonitor({
  tenantId,
  callId,
  baseUrl,
}: {
  tenantId: string;
  callId: string;
  baseUrl?: string;
}) {
  const { state, error, isConnected } = useVoiceEventStream({
    tenantId,
    baseUrl,
    onEvent: (event) => {
      console.log('[CallMonitor] Event:', event.eventType, event.payload);
    },
  });

  if (!state || state.callId !== callId) {
    return <div className="call-monitor loading">Loading call {callId}...</div>;
  }

  return (
    <div className="call-monitor">
      <div className="header">
        <div className="status-badge" data-status={state.status}>
          {state.status.toUpperCase()}
        </div>
        <div className="connection-indicator" data-connected={isConnected}>
          {isConnected ? '● Connected' : '○ Disconnected'}
        </div>
      </div>

      {error && <div className="error-banner">{error.message}</div>}

      <div className="timeline">
        {state.events.map((event) => (
          <div key={event.streamEventId} className="event-item" data-type={event.eventType}>
            <span className="event-time">{new Date(event.occurredAt).toLocaleTimeString()}</span>
            <span className="event-type">{event.eventType}</span>
            <span className="event-stage">{event.stage}</span>
          </div>
        ))}
      </div>

      {state.transcript && state.transcript.length > 0 && (
        <div className="transcript">
          <h3>Transcript</h3>
          {state.transcript.map((turn) => (
            <div key={turn.sequenceNo} className="turn" data-speaker={turn.speaker}>
              <span className="speaker">{turn.speaker}</span>
              <span className="text">{turn.text}</span>
            </div>
          ))}
        </div>
      )}

      {state.analysis && (
        <div className="analysis">
          <h3>Call Analysis</h3>
          <div className="outcome">
            <span className="label">Outcome:</span>
            <span className="value">{state.analysis.outcome}</span>
          </div>
          <div className="confidence">
            <span className="label">Confidence:</span>
            <span className="value">{(state.analysis.confidence * 100).toFixed(1)}%</span>
          </div>

          {state.analysis.lead && (
            <div className="lead-data">
              <h4>Extracted Lead</h4>
              {state.analysis.lead.propertyType && (
                <p>
                  <strong>Property:</strong> {state.analysis.lead.propertyType}
                </p>
              )}
              {state.analysis.lead.location && (
                <p>
                  <strong>Location:</strong> {state.analysis.lead.location}
                </p>
              )}
              {state.analysis.lead.budget && (
                <p>
                  <strong>Budget:</strong> {state.analysis.lead.budget}
                </p>
              )}
              {state.analysis.lead.timeline && (
                <p>
                  <strong>Timeline:</strong> {state.analysis.lead.timeline}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default VoiceEventClient;
