---
title: "Privacy Policy"
meta_title: "Website Privacy Notice | VLABS | Owner-Review Draft"
description: "Owner-review draft covering VLABS website enquiries, browser preferences and payment-integration disclosures that require confirmation."
draft: false
noindex: true
---

**Draft website notice — OWNER REVIEW REQUIRED.** This page describes website flows, not a complete privacy policy or institutional data-processing agreement for the VLABS learning platform. The owner must confirm the responsible legal entity, deployed services, retention, cookies and applicable requirements before treating it as a final policy.

**Checkout integration must be reviewed before accepting payments.** The interface and server currently describe different payment flows. The section below records that discrepancy; this notice does not make checkout operational.

## Enquiries and Follow-Up Requests

The contact form requests your name, email address, phone number and message. The follow-up form requests your name and email address. Share only information needed for your enquiry. Do not submit passwords, payment card numbers, student records or other sensitive material.

When the integration is configured, the website sends enquiry details to GoHighLevel (LeadConnector) for contact management and follow-up. A contact message may be recorded with the contact. A follow-up request does not automatically provide a download, confirm a pilot place or create a learning account.

## Payment Disclosures Under Review

**Interface intent.** The checkout interface collects a name and email address and sends the selected plan ID, month/year interval and language to the website server. It describes PayPal subscriptions for English/USD and one-time SePay prepaid payments for Vietnamese/VND. These are intended flows, not verified live payment integrations.

**Current server route.** With the required configuration and request data, the server route is written to create a Stripe hosted card checkout for a recurring monthly or yearly subscription in USD. It determines the amount from canonical server-side plan prices, not a browser-submitted price. The route requires a plan title, while the interface sends a plan ID and language; their response formats also differ. These contracts and disclosures need to be reconciled and tested before payment collection.

An eligible request may send the provided contact details to GoHighLevel for checkout follow-up when that integration is configured. Stripe receives the email address and subscription details and collects card information on its hosted page. The website enquiry forms do not collect card numbers.

The current website does not implement Supabase order storage or automatic VLABS learning-account provisioning. A payment return URL or query parameter is not proof of payment; status must be verified using authenticated provider information.

## Browser Preferences and Displayed Prices

When browser storage is available, the light/dark switch saves the selected theme in local storage for later visits. This appearance preference is not sent to payment providers or GoHighLevel. Clear the site data in your browser to remove it. Without a saved choice, the website follows the device theme setting.

Language and displayed currency switch together: English/USD or Vietnamese/VND. A manual language choice is saved locally when possible and carried in links with a `lang` query marker. If storage is blocked and a later visit has no marker, the choice may not persist. Without a manual choice, hosting-provided country information may select Vietnamese/VND for Vietnam and English/USD otherwise. No browser location permission or external geolocation lookup is used. Without JavaScript, the requested page determines language and displayed currency.

Displayed Vietnamese prices use the fixed business conversion of 1 USD = 26,000 VND, not a live exchange rate. A VND display does not establish that the current server route can process a VND payment; that route is written for USD subscriptions.

## Third-Party Services and Owner Confirmation

GoHighLevel and Stripe are referenced by the existing server routes; their use depends on deployment configuration. Review [GoHighLevel Privacy Policy](https://www.gohighlevel.com/privacy-policy) and [Stripe Privacy Policy](https://stripe.com/privacy) for their service disclosures.

PayPal, SePay and Supabase are proposed or interface-referenced services, not verified integrations in the current website. Their policy references are retained for review: [PayPal Privacy Policy](https://www.paypal.com/legalhub/privacy-full), [SePay Privacy Policy](https://sepay.vn/privacy.html) and [Supabase Privacy Policy](https://supabase.com/privacy).

The owner must confirm actual hosting logs, analytics, cookies, processors, retention and processing locations for the deployed site. Linked third-party pages may apply their own cookies and policies. This draft establishes no particular retention period, jurisdiction or security certification.

## Privacy Questions and Requests

Email [info.vlabs@learningsmart.io.vn](mailto:info.vlabs@learningsmart.io.vn) to ask about your enquiry information, request a correction or deletion, or discuss institutional privacy requirements. Provide enough context to identify the request without sending sensitive records.

Before using a future VLABS deployment with students or employees, request the applicable product privacy information, access rules and institutional data-handling terms. The development proposal is not a substitute for those documents.
