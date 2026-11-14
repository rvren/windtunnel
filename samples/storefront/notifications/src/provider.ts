// The outside email provider.
export declare const emailProvider: {
  send(email: { subject: string; body: string }): Promise<void>;
};
