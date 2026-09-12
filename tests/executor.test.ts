import { describe, it, expect } from "vitest";
import { executeFlow } from "../src/executor";
import type { FlowJSON, ExecuteInput } from "../src/types";
import { VERTICAL_TEMPLATES } from "../src/templates";
import { canvasToFlowJson } from "../ui/src/utils/serialize";

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
  const structuredFlow: FlowJSON = {
    start_node: "gender",
    nodes: [
      {
        id: "gender",
        type: "menu",
        data: {
          text: "Registering as:",
          deterministic: true,
          options: [{ label: "Groom", value: "male", store_as: "gender", next: "profile" }],
        },
      },
      {
        id: "profile",
        type: "capture",
        data: {
          mode: "structured",
          prompt: "Complete the profile form",
          fields: [
            { label: "Full Name", variable: "profile_name", required: true, aliases: ["Name"] },
            { label: "Age", variable: "profile_age", required: true, validation: "number" },
            { label: "Height", variable: "profile_height", required: true },
            { label: "Highest Education / Qualification", variable: "profile_education", required: true, aliases: ["Education"] },
            { label: "Profession / Job", variable: "profile_profession", required: true, aliases: ["Profession"] },
            { label: "City / Location", variable: "profile_location", required: true, aliases: ["Location"] },
            { label: "Religion / Community / Caste", variable: "profile_religion", required: false, aliases: ["Religion"] },
            { label: "About yourself / what you're looking for", variable: "profile_about", required: true, aliases: ["About"] },
            { label: "WhatsApp / Contact Number", variable: "profile_phone", required: true, validation: "phone", aliases: ["Phone"] },
          ],
        },
        next: "confirm",
      },
      { id: "confirm", type: "message", data: { text: "Thanks {{profile_name}} ({{gender}})" }, next: null },
    ],
  };

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

  it("Menu → Message → Menu: renders the message and destination menu immediately", () => {
    const flow: FlowJSON = {
      start_node: "main",
      nodes: [
        {
          id: "main",
          type: "menu",
          data: {
            text: "Choose:",
            options: [{ label: "Add My Profile (Free)", value: "add", next: "intro" }],
          },
        },
        { id: "intro", type: "message", data: { text: "Adding your profile is free." }, next: "gender" },
        {
          id: "gender",
          type: "menu",
          data: {
            text: "Registering as:",
            deterministic: true,
            options: [
              { label: "Groom", value: "male", store_as: "gender", next: "profile" },
              { label: "Bride", value: "female", store_as: "gender", next: "profile" },
            ],
          },
        },
        structuredFlow.nodes[1],
        structuredFlow.nodes[2],
      ],
    };

    const result = executeFlow(flow, makeInput({ current_node: "main", message_text: "add" }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.reply_text).toContain("Adding your profile is free.");
    expect(result.reply_text).toContain("Registering as:");
    expect(result.reply_buttons?.map((option) => option.value)).toEqual(["male", "female"]);
    expect(result.next_node).toBe("gender");
  });

  it("Menu → Structured Capture: renders the capture prompt immediately", () => {
    const result = executeFlow(structuredFlow, makeInput({
      current_node: "gender",
      message_text: "Groom",
    }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.reply_text).toBe("Complete the profile form");
    expect(result.next_node).toBe("profile");
  });

  it("preserves gender while auto-advancing into Structured Capture", () => {
    const result = executeFlow(structuredFlow, makeInput({
      current_node: "gender",
      message_text: "male",
      variables: { existing: "kept" },
    }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.variables).toMatchObject({ gender: "male", existing: "kept" });
  });

  it("does not invoke AI fallback during deterministic registration auto-advance", () => {
    const result = executeFlow(structuredFlow, makeInput({
      current_node: "gender",
      message_text: "1",
    }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.reply_text).toBe("Complete the profile form");
    expect(result.next_node).toBe("profile");
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

  it("Condition → Message → Message → image Message → Capture auto-advances in one reply", () => {
    const flow: FlowJSON = {
      start_node: "subscription",
      nodes: [
        {
          id: "subscription",
          type: "condition",
          data: {
            variable: "subscription_active",
            operator: "eq",
            value: "yes",
            true_next: "profiles",
            false_next: "no-subscription",
          },
        },
        { id: "profiles", type: "message", data: { text: "Subscribed profiles" }, next: null },
        { id: "no-subscription", type: "message", data: { text: "No active subscription" }, next: "plans" },
        { id: "plans", type: "message", data: { text: "Subscription plans" }, next: "qr" },
        {
          id: "qr",
          type: "message",
          data: { text: "Scan this QR", image_url: "https://example.com/actual-qr.png" },
          next: "payment-ref",
        },
        {
          id: "payment-ref",
          type: "capture",
          data: { prompt: "Enter your payment reference", variable: "payment_ref" },
          next: "end",
        },
        { id: "end", type: "end" },
      ],
    };

    const result = executeFlow(flow, makeInput({
      current_node: "subscription",
      variables: { subscription_active: "no" },
    }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.reply_text).toBe([
      "No active subscription",
      "Subscription plans",
      "Scan this QR",
      "Enter your payment reference",
    ].join("\n\n"));
    expect(result.reply_image_url).toBe("https://example.com/actual-qr.png");
    expect(result.next_node).toBe("payment-ref");
    expect(result.variables.subscription_active).toBe("no");
  });

  it("stops passive Message traversal when a cycle is detected", () => {
    const flow: FlowJSON = {
      start_node: "first",
      nodes: [
        { id: "first", type: "message", data: { text: "First" }, next: "second" },
        { id: "second", type: "message", data: { text: "Second" }, next: "first" },
      ],
    };

    const result = executeFlow(flow, makeInput({ current_node: "first" }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.reply_text).toBe("First\n\nSecond");
    expect(result.next_node).toBe("first");
  });

  it("structured Capture parses all profile fields, including education and profession", () => {
    const message = [
      "Full Name: Ahmed Ali",
      "Age: 29",
      "Height: 178 cm",
      "Highest Education / Qualification: MBA",
      "Profession / Job: Accountant",
      "City / Location: Dubai",
      "Religion / Community / Caste: Muslim",
      "About yourself / what you're looking for: Family-oriented professional",
      "seeking a kind and educated partner.",
      "WhatsApp / Contact Number: +971501234567",
    ].join("\n");

    const result = executeFlow(structuredFlow, makeInput({
      current_node: "profile",
      message_text: message,
      variables: { gender: "male" },
    }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.next_node).toBe("confirm");
    expect(result.variables).toMatchObject({
      gender: "male",
      profile_name: "Ahmed Ali",
      profile_age: "29",
      profile_height: "178 cm",
      profile_education: "MBA",
      profile_profession: "Accountant",
      profile_location: "Dubai",
      profile_religion: "Muslim",
      profile_phone: "+971501234567",
    });
    expect(result.variables.profile_about).toContain("seeking a kind and educated partner.");
  });

  it("structured Capture saves valid fields and asks only for missing or invalid fields", () => {
    const result = executeFlow(structuredFlow, makeInput({
      current_node: "profile",
      message_text: [
        "Name: Aisha Rahman",
        "Age: twenty eight",
        "Height: 165 cm",
        "Education: BSc",
        "Profession: Teacher",
        "Location: Kozhikode",
        "About: Looking for a compatible partner",
        "Phone: invalid",
      ].join("\n"),
      variables: { gender: "female" },
    }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.next_node).toBe("profile");
    expect(result.variables.profile_name).toBe("Aisha Rahman");
    expect(result.variables.profile_education).toBe("BSc");
    expect(result.variables.profile_profession).toBe("Teacher");
    expect(result.variables.profile_age).toBeUndefined();
    expect(result.variables.profile_phone).toBeUndefined();
    expect(result.reply_text).toContain("Age:");
    expect(result.reply_text).toContain("WhatsApp / Contact Number:");
    expect(result.reply_text).not.toContain("Full Name:");
    expect(result.reply_text).not.toContain("Religion / Community / Caste:");
  });

  it("structured Capture merges corrected fields without losing gender or earlier values", () => {
    const variables = {
      gender: "female",
      profile_name: "Aisha Rahman",
      profile_height: "165 cm",
      profile_education: "BSc",
      profile_profession: "Teacher",
      profile_location: "Kozhikode",
      profile_about: "Looking for a compatible partner",
    };
    const result = executeFlow(structuredFlow, makeInput({
      current_node: "profile",
      message_text: "Age: 28\nPhone: +919876543210",
      variables,
    }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.next_node).toBe("confirm");
    expect(result.variables.gender).toBe("female");
    expect(result.variables.profile_education).toBe("BSc");
    expect(result.variables.profile_profession).toBe("Teacher");
    expect(result.variables.profile_age).toBe("28");
    expect(result.variables.profile_phone).toBe("+919876543210");
  });

  it("structured Capture accepts a plain response when exactly one field remains", () => {
    const result = executeFlow(structuredFlow, makeInput({
      current_node: "profile",
      message_text: "+919876543210",
      variables: {
        gender: "male",
        profile_name: "Ahmed Ali",
        profile_age: "29",
        profile_height: "178 cm",
        profile_education: "MBA",
        profile_profession: "Accountant",
        profile_location: "Dubai",
        profile_about: "Looking for a partner",
      },
    }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.next_node).toBe("confirm");
    expect(result.variables.profile_phone).toBe("+919876543210");
  });

  it("structured Capture remains deterministic for question-like profile text", () => {
    const result = executeFlow(structuredFlow, makeInput({
      current_node: "profile",
      message_text: "About: Who am I looking for? Someone kind and respectful.",
      variables: {},
    }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.next_node).toBe("profile");
    expect(result.variables.profile_about).toContain("Who am I looking for?");
  });

  it("gender menu stores the selected gender before structured Capture", () => {
    const result = executeFlow(structuredFlow, makeInput({ current_node: "gender", message_text: "Groom" }));
    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.next_node).toBe("profile");
    expect(result.reply_text).toBe("Complete the profile form");
    expect(result.variables.gender).toBe("male");
  });

  it("Nikah Kerala template uses the four-node structured registration path with all existing fields", () => {
    const template = VERTICAL_TEMPLATES.find((item) => item.id === "matrimony-service");
    expect(template).toBeDefined();
    if (!template) return;

    const intro = template.flow_json.nodes.find((node) => node.id === "mat_profile_intro");
    const gender = template.flow_json.nodes.find((node) => node.id === "mat_p_gender");
    const profile = template.flow_json.nodes.find((node) => node.id === "mat_p_profile");

    expect(intro?.type === "message" && intro.next).toBe("mat_p_gender");
    expect(gender?.type).toBe("menu");
    if (gender?.type === "menu") {
      expect(gender.data.deterministic).toBe(true);
      expect(gender.data.options.every((option) => option.store_as === "gender" && option.next === "mat_p_profile")).toBe(true);
    }
    expect(profile?.type).toBe("capture");
    if (profile?.type === "capture" && profile.data.mode === "structured") {
      expect(profile.next).toBe("mat_p_confirm");
      expect(profile.data.fields.map((field) => field.variable)).toEqual([
        "profile_name",
        "profile_age",
        "profile_height",
        "profile_education",
        "profile_profession",
        "profile_location",
        "profile_religion",
        "profile_about",
        "profile_phone",
      ]);
    }
    expect(template.flow_json.nodes.some((node) => node.id === "mat_p_name")).toBe(false);
  });

  it("builder serialization preserves menu store_as and structured Capture fields", () => {
    const flow = canvasToFlowJson(
      [
        {
          id: "gender",
          type: "menu",
          position: { x: 0, y: 0 },
          data: {
            text: "Registering as:",
            deterministic: true,
            options: [{ label: "Bride", value: "female", store_as: "gender" }],
          },
        },
        {
          id: "profile",
          type: "capture",
          position: { x: 0, y: 100 },
          data: {
            mode: "structured",
            prompt: "Profile",
            fields: [{ label: "Education", variable: "profile_education", required: true }],
          },
        },
      ],
      [
        { id: "edge", source: "gender", sourceHandle: "opt-0", target: "profile" },
      ]
    );

    const menu = flow.nodes.find((node) => node.id === "gender") as any;
    const capture = flow.nodes.find((node) => node.id === "profile") as any;
    expect(menu.data.options[0]).toMatchObject({ store_as: "gender", next: "profile" });
    expect(menu.data.deterministic).toBe(true);
    expect(capture.data.fields[0]).toMatchObject({ variable: "profile_education", required: true });
  });

  it("Form collects multiple fields and emits a completed submission", () => {
    const flow: FlowJSON = {
      start_node: "form1",
      nodes: [
        {
          id: "form1",
          type: "form",
          data: {
            title: "Lead form",
            fields: [
              { id: "name", label: "Your name", variable: "name", type: "text", required: true },
              { id: "email", label: "Your email", variable: "email", type: "email", required: true },
            ],
            success_text: "Thanks {{name}}",
            sheet_sync: { enabled: true, webhook_url: "https://example.com/hook", sheet_name: "Leads" },
          },
          next: "end1",
        },
        { id: "end1", type: "end" },
      ],
    };

    const first = executeFlow(flow, makeInput({ current_node: "form1", message_text: "Sara" }));
    expect(first.kind).toBe("reply");
    if (first.kind !== "reply") return;
    expect(first.reply_text).toContain("Your email");
    expect(first.variables.name).toBe("Sara");

    const invalid = executeFlow(flow, makeInput({ current_node: "form1", message_text: "not-an-email", variables: first.variables }));
    expect(invalid.kind).toBe("reply");
    if (invalid.kind !== "reply") return;
    expect(invalid.next_node).toBe("form1");
    expect(invalid.reply_text).toContain("valid email");

    const completed = executeFlow(flow, makeInput({ current_node: "form1", message_text: "sara@example.com", variables: invalid.variables }));
    expect(completed.kind).toBe("reply");
    if (completed.kind !== "reply") return;
    expect(completed.reply_text).toBe("Thanks Sara");
    expect(completed.next_node).toBe("end1");
    expect(completed.form_submission?.values).toEqual({ name: "Sara", email: "sara@example.com" });
    expect(completed.form_submission?.sheet_sync?.sheet_name).toBe("Leads");
  });
});
