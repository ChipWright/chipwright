// Command queue: commands the cloud holds for a device until the device drains them.

import { randomUUID } from "node:crypto";

export interface Command {
  id: string;
  name: string;
  args: Record<string, unknown>;
  enqueuedAt: number;
}

export class CommandQueue {
  private readonly byDevice = new Map<string, Command[]>();

  enqueue(deviceId: string, name: string, args: Record<string, unknown>, at: number): Command {
    const command: Command = { id: randomUUID(), name, args, enqueuedAt: at };
    const queue = this.byDevice.get(deviceId);
    if (queue === undefined) {
      this.byDevice.set(deviceId, [command]);
    } else {
      queue.push(command);
    }
    return command;
  }

  pending(deviceId: string): Command[] {
    return [...(this.byDevice.get(deviceId) ?? [])];
  }

  // Returns the pending commands and clears the queue, modelling a device that has
  // received and acknowledged them.
  drain(deviceId: string): Command[] {
    const queue = this.byDevice.get(deviceId) ?? [];
    this.byDevice.set(deviceId, []);
    return queue;
  }
}
