// The message queue the orders service publishes to.
export declare const queue: {
  subscribe(topic: string): AsyncIterable<{ body: string; ack(): Promise<void> }>;
};
