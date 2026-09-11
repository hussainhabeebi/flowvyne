import { describe, it, expect } from "vitest";
import { executeFlow } from "../src/executor";
import type { FlowJSON, ExecuteInput } from "../src/types";

function makeInput(overrides: Partial<ExecuteInput> = {}): ExecuteInput {
  return {
    tenant_id: "t1",
    contact_id: "c1",
    message_text: "",
    current_node: null,
    variables: {},
    ...overrides,
  };
}

describe("executeFlow", () => {
  it("Message → Menu: combines message text and menu prompt + buttons in one reply", () => {
    const flow: FlowJSON = {
      start_node: "msg1",
      nodes: [
        { id: "msg1", type: "message", data: { text: "Welcome!" }, next: "menu1" },
        {
          id: "menu1",
          type: "menu",
          data: {
            text: "Choose an option:",
            options: [
              { label: "Option A", value: "a", next: "end1" },
              { label: "Option B", value: "b", next: "end1" },
            ],
          },
        },
        { id: "end1", type: "end" },
      ],
    };

    const result = executeFlow(flow, makeInput({ current_node: "msg1" }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.reply_text).toContain("Welcome!");
    expect(result.reply_text).toContain("Choose an option:");
    expect(result.reply_buttons).toHaveLength(2);
    expect(result.next_node).toBe("menu1"); // waiting on menu, not the message
  });

  it("Message → Capture: combines message text and capture prompt in one reply", () => {
    const flow: FlowJSON = {
      start_node: "msg1",
      nodes: [
        { id: "msg1", type: "message", data: { text: "Registration started!" }, next: "cap1" },
        {
          id: "cap1",
          type: "capture",
          data: { prompt: "What is your name?", variable: "name" },
          next: "end1",
        },
        { id: "end1", type: "end" },
      ],
    };

    const result = executeFlow(flow, makeInput({ current_node: "msg1" }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.reply_text).toContain("Registration started!");
    expect(result.reply_text).toContain("What is your name?");
    expect(result.reply_buttons).toBeUndefined();
    expect(result.next_node).toBe("cap1"); // waiting on capture, not the message
  });

  it("Message with image_url preserves reply_image_url", () => {
    const flow: FlowJSON = {
      start_node: "msg1",
      nodes: [
        {
          id: "msg1",
          type: "message",
          data: { text: "Scan the QR code", image_url: "https://example.com/qr.png" },
          next: null,
        },
      ],
    };

    const result = executeFlow(flow, makeInput({ current_node: "msg1" }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.reply_text).toBe("Scan the QR code");
    expect(result.reply_image_url).toBe("https://example.com/qr.png");
    expect(result.next_node).toBeNull();
  });

  it("Message with image_url → Capture: preserves image in combined reply", () => {
    const flow: FlowJSON = {
      start_node: "msg1",
      nodes: [
        {
          id: "msg1",
          type: "message",
          data: { text: "Pay via QR:", image_url: "https://example.com/qr.png" },
          next: "cap1",
        },
        {
          id: "cap1",
          type: "capture",
          data: { prompt: "Enter your transaction ID:", variable: "txn_id" },
          next: "end1",
        },
        { id: "end1", type: "end" },
      ],
    };

    const result = executeFlow(flow, makeInput({ current_node: "msg1" }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.reply_text).toContain("Pay via QR:");
    expect(result.reply_text).toContain("Enter your transaction ID:");
    expect(result.reply_image_url).toBe("https://example.com/qr.png");
    expect(result.next_node).toBe("cap1");
  });
});
