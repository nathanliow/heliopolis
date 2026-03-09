interface PhantomSolana {
  isPhantom: boolean;
  connect(): Promise<{ publicKey: { toString(): string; toBytes(): Uint8Array } }>;
  disconnect(): Promise<void>;
  signMessage(
    message: Uint8Array,
    encoding: string
  ): Promise<{ signature: Uint8Array }>;
  on(event: string, callback: () => void): void;
}

interface Window {
  phantom?: {
    solana?: PhantomSolana;
  };
}
