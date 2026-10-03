import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LEGAL_ENTITY, LEGAL_ADDRESS, LEGAL_EMAIL } from "@/components/marketing/legal-page";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms Of Service — LeadTrace" },
      { name: "description", content: "The terms that govern your use of LeadTrace lead lists, skip trace, and SMS outreach." },
      { property: "og:title", content: "LeadTrace Terms Of Service" },
      { property: "og:description", content: "Terms governing LeadTrace accounts, credits, data, and messaging." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Terms Of Service">
      <p>These Terms govern your use of LeadTrace, operated by {LEGAL_ENTITY} ("we", "us"). By creating an account you agree to them.</p>
      <h2>Accounts And Workspaces</h2>
      <p>You must provide accurate information and keep your credentials secure. You are responsible for activity in your workspaces, including teammates you invite.</p>
      <h2>Credits And Billing</h2>
      <p>Lead, skip trace, and SMS usage is paid with credits. Purchased credits are non-refundable except where a source fails and we refund the affected run automatically. Prices are shown at checkout.</p>
      <h2>Acceptable Use</h2>
      <ul>
        <li>Use data only for lawful purposes and in line with the FCRA, TCPA, CAN-SPAM, and state law.</li>
        <li>Do not use LeadTrace data to decide eligibility for credit, employment, insurance, or housing.</li>
        <li>Do not message anyone who has opted out, and do not attempt to bypass DNC scrubbing, quiet hours, or opt-out handling.</li>
      </ul>
      <h2>Messaging</h2>
      <p>SMS outreach is subject to our <Link to="/sms-terms" className="text-primary">SMS Terms And Consent Policy</Link>. You are responsible for having a lawful basis to contact each recipient.</p>
      <h2>Data Sources</h2>
      <p>Records come from public sources, licensed providers, and lists you upload. We do not guarantee completeness or accuracy, and each section shows when its data was last collected.</p>
      <h2>Termination</h2>
      <p>We may suspend accounts that violate these Terms or messaging rules. You may close your account at any time.</p>
      <h2>Limitation Of Liability</h2>
      <p>The service is provided "as is". To the extent permitted by law, our liability is limited to the amount you paid us in the 12 months before the claim.</p>
      <h2>Contact</h2>
      <p>{LEGAL_ENTITY}, {LEGAL_ADDRESS}. Email: {LEGAL_EMAIL}.</p>
    </LegalPage>
  );
}
