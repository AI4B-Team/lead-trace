import { createEmailWebhookHandler } from '@lovable.dev/email-js'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute("/lovable/email/events")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const apiKey = process.env['LOVABLE_API_KEY']
        if (!apiKey) {
          console.error('Missing required environment variables')
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }
        const handler = createEmailWebhookHandler({
          apiKey,
          on: {
            // A records request that hard-bounces or draws a complaint means the
            // custodian address on file is wrong. Park the request and clear the
            // address so the county returns to the admin "awaiting contact"
            // queue. Throw on failure so the delivery is retried.
            'email.bounced': async (event) => {
              const { handleUndeliverableRecipient } = await import('@/lib/records-requests.server')
              const result = await handleUndeliverableRecipient(event.data.recipient, 'bounced')
              console.log('Email bounced', { event_id: event.event_id, agencies: result.matched })
            },
            'email.complaint': async (event) => {
              const { handleUndeliverableRecipient } = await import('@/lib/records-requests.server')
              const result = await handleUndeliverableRecipient(event.data.recipient, 'complaint')
              console.log('Email complaint', { event_id: event.event_id, agencies: result.matched })
            },
            'email.unsubscribed': async (event) => {
              // Records custodians are not a mailing list; nothing to reconcile.
              console.log('Email unsubscribed', { event_id: event.event_id })
            },
          },
        })
        return handler(request)
      },
    },
  },
})
