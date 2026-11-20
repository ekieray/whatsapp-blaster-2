export type WaStatus = "disconnected" | "connecting" | "qr_ready" | "connected";

export interface WaState {
  status: WaStatus;
  qrDataUrl: string | null;
  user: { id: string; name: string } | null;
  lastError: string | null;
  qrUpdatedAt: string | null;
}

export interface BusinessProfile {
  businessName: string;
  productType: string;
  description: string;
  targetAudience: string;
  promoType: string;
  tone: string;
  customPrompt: string;
  faqNotes: string;
}

export interface CopyVariation {
  title: string;
  angle: string;
  message: string;
}

export interface AutoReplyLog {
  id: string;
  sender: string;
  senderName: string;
  incoming: string;
  reply: string;
  timestamp: string;
  source: "whatsapp" | "simulation";
}

export interface BlastItem {
  number: string;
  name: string;
  status: "queued" | "sending" | "sent" | "failed";
  error: string | null;
  sentAt: string | null;
}

export interface BlastState {
  running: boolean;
  total: number;
  sent: number;
  failed: number;
  currentTarget: string | null;
  delayCountdownSec: number;
  items: BlastItem[];
  startedAt: string | null;
  finishedAt: string | null;
}

export interface CodespaceFile {
  key: string;
  relPath: string;
  language: string;
  content: string;
}

export interface ChatSource {
  title: string;
  uri: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: string;
  model?: string;
  sources?: ChatSource[];
}

export interface WaContact {
  number: string;
  name: string;
}
