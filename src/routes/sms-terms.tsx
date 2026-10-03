import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LEGAL_ENTITY, LEGAL_EMAIL } from "@/components/marketing/legal-page";

export const Route = createFileRoute("/sms-terms")({
  head: () => ({
    meta: [
      { title: "SMS Terms And Consent — LeadTrace" },
      { name: "description", content: "How SMS outreach sent through LeadTrace handles consent, STOP and HELP, quiet hours, and opt-outs." },
      { property: "og:title", content: "LeadTrace SMS Terms And Consent Policy" },
      { property: "og:description", content: "STOP handling, quiet hours, and opt-out rules for messages sent through LeadTrace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SmsTerms,
});

function SmsTerms() {
  return (
    <LegalPage title="SMS Terms And Consent Policy">
      <p>Businesses use LeadTrace, operated by {LEGAL_ENTITY}, to send text messages. Each sending business is responsible for having a lawful basis to message its recipients.</p>
      <h2>Opting Out</h2>
      <p>Reply STOP (or UNSUBSCRIBE, CANCEL, END, QUIT) to any message to stop receiving texts from that sender. Your number is added to that business's suppression list immediately and is checked before every future send, across all of its campaigns.</p>
      <h2>Help</h2>
      <p>Reply HELP for help, or email {LEGAL_EMAIL}. Message and data rates may apply. Message frequency varies.</p>
      <h2>Quiet Hours</h2>
      <p>Messages are only sent between 8am and 9pm in the recipient's local time zone, and inside any narrower window the sender sets. Messages outside that window wait until it opens.</p>
      <h2>Do Not Call And Litigator Screening</h2>
      <p>Before any send, numbers are checked against federal and state Do Not Call lists and known litigator lists. If that check cannot be completed, the message is not sent.</p>
      <h2>For Senders</h2>
      <ul>
        <li>Sending requires an approved 10DLC brand and campaign registration.</li>
        <li>Every first message identifies the sender and includes opt-out instructions.</li>
        <li>Opt-outs cannot be overridden from within a campaign.</li>
      </ul>
      <p>Carriers are not liable for delayed or undelivered messages.</p>
    </LegalPage>
  );
}
