import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LEGAL_ENTITY, LEGAL_ADDRESS, LEGAL_EMAIL } from "@/components/marketing/legal-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — LeadTrace" },
      { name: "description", content: "How LeadTrace collects, uses, and protects account data and the records it processes." },
      { property: "og:title", content: "LeadTrace Privacy Policy" },
      { property: "og:description", content: "What we collect, why, and the choices you have." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>This policy explains how {LEGAL_ENTITY} handles information in LeadTrace.</p>
      <h2>What We Collect</h2>
      <ul>
        <li>Account data: name, email, workspace details, and billing records (card details are held by our payment processor, not us).</li>
        <li>Usage data: lists built, messages sent, and product activity, used to run and improve the service.</li>
        <li>Record data: public records, licensed property data, and lists you upload.</li>
        <li>Messaging data: SMS content, delivery status, and opt-out replies.</li>
      </ul>
      <h2>How We Use It</h2>
      <p>To provide the service, process payments, enforce opt-outs and compliance checks, prevent abuse, and contact you about your account. We do not sell your account data.</p>
      <h2>Opt-Outs</h2>
      <p>Anyone who replies STOP to a message sent through LeadTrace is added to that workspace's suppression list and is not messaged again from it.</p>
      <h2>Sharing</h2>
      <p>We share data with service providers that help us run LeadTrace (hosting, payments, messaging carriers, data vendors) and when required by law.</p>
      <h2>Retention And Security</h2>
      <p>We keep data while your account is active and as required for compliance records. Access is restricted by workspace and role.</p>
      <h2>Your Choices</h2>
      <p>You can request access to, correction of, or deletion of your account data by emailing {LEGAL_EMAIL}.</p>
      <h2>Contact</h2>
      <p>{LEGAL_ENTITY}, {LEGAL_ADDRESS}. Email: {LEGAL_EMAIL}.</p>
    </LegalPage>
  );
}
