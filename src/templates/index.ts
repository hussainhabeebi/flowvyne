import type { FlowJSON } from "../types";

export type Template = {
  id: string;
  name: string;
  description: string;
  vertical: string;
  trigger_keywords: string[];
  flow_json: FlowJSON;
};

export const VERTICAL_TEMPLATES: Template[] = [
  // ── Lead Generation ────────────────────────────────────────────────────
  {
    id: "lead-gen",
    name: "Lead Qualification",
    description: "Capture name, email, company and qualify the lead.",
    vertical: "lead-gen",
    trigger_keywords: ["demo", "pricing", "contact", "interested"],
    flow_json: {
      start_node: "lg_welcome",
      nodes: [
        {
          id: "lg_welcome",
          type: "message",
          data: { text: "Hi! I'd love to learn more about you. What's your name?" },
          next: "lg_capture_name",
        },
        {
          id: "lg_capture_name",
          type: "capture",
          data: { prompt: "", variable: "name", validation: "none" },
          next: "lg_ask_email",
        },
        {
          id: "lg_ask_email",
          type: "message",
          data: { text: "Nice to meet you, {{name}}! What's your work email?" },
          next: "lg_capture_email",
        },
        {
          id: "lg_capture_email",
          type: "capture",
          data: {
            prompt: "",
            variable: "email",
            validation: "email",
            error_text: "That doesn't look like a valid email. Please try again.",
          },
          next: "lg_ask_company",
        },
        {
          id: "lg_ask_company",
          type: "message",
          data: { text: "Great! What company are you from?" },
          next: "lg_capture_company",
        },
        {
          id: "lg_capture_company",
          type: "capture",
          data: { prompt: "", variable: "company", validation: "none" },
          next: "lg_ask_size",
        },
        {
          id: "lg_ask_size",
          type: "menu",
          data: {
            text: "How large is your team?",
            options: [
              { label: "1–10", value: "small", next: "lg_thanks_small" },
              { label: "11–100", value: "medium", next: "lg_thanks_medium" },
              { label: "100+", value: "large", next: "lg_thanks_large" },
            ],
          },
        },
        {
          id: "lg_thanks_small",
          type: "message",
          data: {
            text: "Thanks {{name}}! We have great starter plans. A team member will reach out to {{email}} within 24h.",
          },
          next: null,
        },
        {
          id: "lg_thanks_medium",
          type: "message",
          data: {
            text: "Thanks {{name}}! We'll set up a personalised demo for {{company}}. Expect an email at {{email}} shortly.",
          },
          next: null,
        },
        {
          id: "lg_thanks_large",
          type: "message",
          data: {
            text: "Excellent! Our enterprise team will reach out to {{email}} to discuss a custom plan for {{company}}.",
          },
          next: null,
        },
      ],
    },
  },

  // ── E-Commerce ─────────────────────────────────────────────────────────
  {
    id: "ecommerce-support",
    name: "E-Commerce Support",
    description: "Order status, returns, and general shopping help.",
    vertical: "ecommerce",
    trigger_keywords: ["order", "return", "refund", "track", "shipping"],
    flow_json: {
      start_node: "ec_menu",
      nodes: [
        {
          id: "ec_menu",
          type: "menu",
          data: {
            text: "Hi! How can I help you today?",
            options: [
              { label: "Track my order", value: "track", next: "ec_track" },
              { label: "Return / Refund", value: "return", next: "ec_return" },
              { label: "Product question", value: "product", next: "ec_product" },
            ],
          },
        },
        {
          id: "ec_track",
          type: "capture",
          data: {
            prompt: "Please share your order number and I'll look it up.",
            variable: "order_id",
            validation: "none",
          },
          next: "ec_track_reply",
        },
        {
          id: "ec_track_reply",
          type: "message",
          data: { text: "Got it! I've flagged order {{order_id}} for our team to update you within the hour." },
          next: null,
        },
        {
          id: "ec_return",
          type: "capture",
          data: {
            prompt: "Please share your order number to start a return.",
            variable: "return_order_id",
            validation: "none",
          },
          next: "ec_return_reason",
        },
        {
          id: "ec_return_reason",
          type: "menu",
          data: {
            text: "What's the reason for your return?",
            options: [
              { label: "Wrong item", value: "wrong_item", next: "ec_return_confirm" },
              { label: "Damaged", value: "damaged", next: "ec_return_confirm" },
              { label: "Changed mind", value: "changed_mind", next: "ec_return_confirm" },
            ],
          },
        },
        {
          id: "ec_return_confirm",
          type: "message",
          data: {
            text: "Return request logged for order {{return_order_id}}. You'll receive a prepaid label by email within 24h.",
          },
          next: null,
        },
        {
          id: "ec_product",
          type: "message",
          data: {
            text: "Sure! What would you like to know? I'll connect you with a product specialist.",
          },
          next: "ec_product_capture",
        },
        {
          id: "ec_product_capture",
          type: "capture",
          data: { prompt: "", variable: "product_question", validation: "none" },
          next: "ec_product_thanks",
        },
        {
          id: "ec_product_thanks",
          type: "message",
          data: { text: "Got it. A specialist will follow up on your question shortly." },
          next: null,
        },
      ],
    },
  },

  // ── Healthcare ─────────────────────────────────────────────────────────
  {
    id: "healthcare-appointment",
    name: "Healthcare Appointment Booking",
    description: "Collect patient details and book or reschedule appointments.",
    vertical: "healthcare",
    trigger_keywords: ["appointment", "book", "reschedule", "doctor", "clinic"],
    flow_json: {
      start_node: "hc_menu",
      nodes: [
        {
          id: "hc_menu",
          type: "menu",
          data: {
            text: "Welcome! How can we help you today?",
            options: [
              { label: "Book appointment", value: "book", next: "hc_name" },
              { label: "Reschedule", value: "reschedule", next: "hc_reschedule" },
              { label: "General enquiry", value: "enquiry", next: "hc_enquiry" },
            ],
          },
        },
        {
          id: "hc_name",
          type: "capture",
          data: { prompt: "What's the patient's full name?", variable: "patient_name", validation: "none" },
          next: "hc_phone",
        },
        {
          id: "hc_phone",
          type: "capture",
          data: {
            prompt: "What's the best contact number for {{patient_name}}?",
            variable: "patient_phone",
            validation: "phone",
          },
          next: "hc_specialty",
        },
        {
          id: "hc_specialty",
          type: "menu",
          data: {
            text: "Which department do you need?",
            options: [
              { label: "General Practice", value: "gp", next: "hc_confirm" },
              { label: "Specialist", value: "specialist", next: "hc_confirm" },
              { label: "Emergency", value: "emergency", next: "hc_emergency" },
            ],
          },
        },
        {
          id: "hc_emergency",
          type: "message",
          data: { text: "For emergencies please call 911 or visit your nearest A&E immediately." },
          next: null,
        },
        {
          id: "hc_confirm",
          type: "message",
          data: {
            text: "Thanks {{patient_name}}! We'll call {{patient_phone}} to confirm your appointment time.",
          },
          next: null,
        },
        {
          id: "hc_reschedule",
          type: "capture",
          data: { prompt: "Please share your current appointment reference number.", variable: "appt_ref", validation: "none" },
          next: "hc_reschedule_confirm",
        },
        {
          id: "hc_reschedule_confirm",
          type: "message",
          data: { text: "Got it. We'll call you to arrange a new time for appointment {{appt_ref}}." },
          next: null,
        },
        {
          id: "hc_enquiry",
          type: "capture",
          data: { prompt: "What's your question? We'll get back to you shortly.", variable: "enquiry_text", validation: "none" },
          next: "hc_enquiry_thanks",
        },
        {
          id: "hc_enquiry_thanks",
          type: "message",
          data: { text: "Thank you! Our team will follow up within 1 business day." },
          next: null,
        },
      ],
    },
  },

  // ── Travel ─────────────────────────────────────────────────────────────
  {
    id: "travel-booking",
    name: "Travel Booking Assistant",
    description: "Capture trip details, preferences, and generate a lead.",
    vertical: "travel",
    trigger_keywords: ["travel", "trip", "holiday", "flight", "hotel", "tour"],
    flow_json: {
      start_node: "tv_welcome",
      nodes: [
        {
          id: "tv_welcome",
          type: "message",
          data: { text: "Hello, traveller! ✈️ Where would you like to go?" },
          next: "tv_capture_dest",
        },
        {
          id: "tv_capture_dest",
          type: "capture",
          data: { prompt: "", variable: "destination", validation: "none" },
          next: "tv_ask_dates",
        },
        {
          id: "tv_ask_dates",
          type: "message",
          data: { text: "Great choice! When are you planning to travel to {{destination}}? (e.g. Dec 15 – Dec 22)" },
          next: "tv_capture_dates",
        },
        {
          id: "tv_capture_dates",
          type: "capture",
          data: { prompt: "", variable: "travel_dates", validation: "none" },
          next: "tv_ask_pax",
        },
        {
          id: "tv_ask_pax",
          type: "capture",
          data: { prompt: "How many travellers?", variable: "pax", validation: "number" },
          next: "tv_ask_type",
        },
        {
          id: "tv_ask_type",
          type: "menu",
          data: {
            text: "What kind of trip are you looking for?",
            options: [
              { label: "Beach & Leisure", value: "beach", next: "tv_collect_contact" },
              { label: "Adventure", value: "adventure", next: "tv_collect_contact" },
              { label: "Cultural / City", value: "cultural", next: "tv_collect_contact" },
              { label: "Business", value: "business", next: "tv_collect_contact" },
            ],
          },
        },
        {
          id: "tv_collect_contact",
          type: "capture",
          data: { prompt: "Perfect! What's your email so we can send you a personalised quote?", variable: "email", validation: "email" },
          next: "tv_thanks",
        },
        {
          id: "tv_thanks",
          type: "message",
          data: {
            text: "Amazing! Our travel expert will send your {{destination}} itinerary to {{email}} within 2 hours. Bon voyage! 🌍",
          },
          next: null,
        },
      ],
    },
  },

  // ── Field Service ──────────────────────────────────────────────────────
  {
    id: "field-service",
    name: "Field Service Request",
    description: "Log service requests, capture site details, and schedule a technician.",
    vertical: "field-service",
    trigger_keywords: ["service", "repair", "technician", "maintenance", "breakdown"],
    flow_json: {
      start_node: "fs_menu",
      nodes: [
        {
          id: "fs_menu",
          type: "menu",
          data: {
            text: "Hi! What do you need assistance with?",
            options: [
              { label: "Log a new job", value: "new", next: "fs_capture_name" },
              { label: "Check job status", value: "status", next: "fs_check_status" },
            ],
          },
        },
        {
          id: "fs_capture_name",
          type: "capture",
          data: { prompt: "What's the site contact name?", variable: "contact_name", validation: "none" },
          next: "fs_capture_phone",
        },
        {
          id: "fs_capture_phone",
          type: "capture",
          data: { prompt: "Contact phone number?", variable: "contact_phone", validation: "phone" },
          next: "fs_capture_address",
        },
        {
          id: "fs_capture_address",
          type: "capture",
          data: { prompt: "Site address?", variable: "site_address", validation: "none" },
          next: "fs_urgency",
        },
        {
          id: "fs_urgency",
          type: "menu",
          data: {
            text: "How urgent is this?",
            options: [
              { label: "Emergency (same day)", value: "emergency", next: "fs_confirm_emergency" },
              { label: "Urgent (next business day)", value: "urgent", next: "fs_confirm_standard" },
              { label: "Routine (schedule)", value: "routine", next: "fs_confirm_standard" },
            ],
          },
        },
        {
          id: "fs_confirm_emergency",
          type: "message",
          data: {
            text: "Job logged for {{site_address}}. A technician will contact {{contact_name}} at {{contact_phone}} within 2 hours.",
          },
          next: null,
        },
        {
          id: "fs_confirm_standard",
          type: "message",
          data: {
            text: "Job logged for {{site_address}}. We'll confirm a scheduled time with {{contact_name}} shortly.",
          },
          next: null,
        },
        {
          id: "fs_check_status",
          type: "capture",
          data: { prompt: "Please share your job reference number.", variable: "job_ref", validation: "none" },
          next: "fs_status_reply",
        },
        {
          id: "fs_status_reply",
          type: "message",
          data: { text: "I've flagged job {{job_ref}} for a status update — our team will reply within 30 minutes." },
          next: null,
        },
      ],
    },
  },
];
