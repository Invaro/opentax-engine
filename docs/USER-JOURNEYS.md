# User journeys

The paths people take through opentax.invaro.ai, and what each step should do. Walk them on a preview deployment before every release that touches the site, at laptop width (around 1280 px), at the browser pane width (around 720 px) and on a phone (375 px). Each check is something you can see on the page.

Locally, `next dev` prints sign-in and invite emails to the server log instead of sending them.

To test payments, use Stripe test mode: the test-mode product, its two prices and a billing portal configuration (all tagged `app=opentax`) go in `STRIPE_PRICE_FIRM_MONTHLY`, `STRIPE_PRICE_FIRM_ANNUAL` and `STRIPE_PORTAL_CONFIG`, with a test secret key. Run `stripe listen --forward-to http://localhost:3456/api/billing/webhook` and use its signing secret as `STRIPE_WEBHOOK_SECRET`. Pay with Stripe's test card 4242 4242 4242 4242. Never point a local server at live keys.

## 1. A firm buys the Firm plan

| Step | What should happen |
|---|---|
| Open the homepage | Pricing is in the header at every width; on a phone it sits next to the main button |
| Open Pricing | The Firm plan card lists five benefits, then billing period, seats and the price |
| Clear the seat box and type 12 | The box shows 12 and the price is for 12 seats (never 112) |
| Set 3 to 5 seats | A line offers 6 seats, where every seat drops to $5, with the total; clicking it sets 6 |
| Choose Yearly | The price shows the yearly total and how much less it is than paying monthly |
| Click "Sign in to continue" | The sign-in page says "Sign in to start your Firm plan" |
| Request a code | The page names the address, says the code works ten minutes, offers a new code after 30 seconds, and mentions the spam folder |
| Type the 8 digits | It signs in on the eighth digit, with no extra click |
| After sign-in | Pricing reopens with the same seats and period, scrolls to the card and goes on to Stripe Checkout |
| Stripe Checkout | The page is named "OpenTax by Invaro", the price is in USD only (no local-currency option), the seat count and email match, and the firm name field is there |
| Pay | Stripe returns to the account page, which says "Payment received" and never shows the free plan or an upsell while Stripe confirms |
| Welcome email | Exactly one, and its plan ID is the same one the account page shows |
| If Stripe is slow | The page keeps checking on its own; after a minute it says the payment went through and how to reach us |

## 2. An owner sets up their firm

| Step | What should happen |
|---|---|
| Open Account after paying | "Welcome to OpenTax" with a Firm plan chip, the firm name and email. No plan ID, nothing to note down |
| Get set up | Three cards with a progress bar: connect your agent, ask your first question, invite your team. Each ticks itself off (an app connects, the app makes a call, someone is invited) |
| Connect your agent | Same layout as the homepage: the `/mcp/account` URL with a copy button, a tab per app (Claude, ChatGPT, Cursor, Claude Code, other agents) with three steps, and "Copy setup prompt" for an agent |
| Ask your first question | Three example questions, each with a copy button |
| Your team | Avatars for the owner, members, pending invites (faded) and open seats (dashed), then the list with remove, resend and cancel |
| Get help | support@invaro.ai, and a line saying we'll know the account and plan from the address |
| Manage billing | Opens Stripe's billing page (seats, card, invoices, cancel). If that fails, the error shows at the top of the page, scrolled into view |
| Change seats in billing | Crossing six seats bills every seat at $5; back on the account page the new seat count shows |
| Cancel in billing | The account says the plan ends on the period's last day and keeps working until then |
| The plan ends | The account says the plan ended, keeps the API key and invoices, and offers "Start the Firm plan again" |
| Start again | Pricing opens with the previous seats and billing period; Checkout already has the firm name; the new plan uses the same Stripe customer |
| Invoices | Lists invoices; if they can't load, it says so instead of "No invoices yet" |
| Invite a colleague | "Invite sent to …"; the invite shows as pending with resend and cancel |
| Invite fails (for example, your own address) | The error shows and the address stays in the box |
| Return to Pricing | The card says you're on the Firm plan and links to your account; there is no second checkout |
| Welcome email | "Get set up" button, the three steps, and support@invaro.ai. No plan ID |

## 3. Connecting an agent

| Step | What should happen |
|---|---|
| Add `https://opentax.invaro.ai/mcp/account` in the app | The app opens OpenTax in the browser |
| Signed out | The sign-in page says "Sign in to connect your agent", then returns to the consent page |
| Consent page | The app's logo next to OpenTax, "Connect [app] to OpenTax", the signed-in email with a green "Firm plan · [firm]" badge (or "Free account"), and Connect, Cancel, "Use a different email" |
| Connect | Returns to the app, which now lists the OpenTax tools including `my_account` |
| Ask the app to call `my_account` | It names the email, the plan and the firm |
| Account page | The app shows under Connected apps with when it connected and when it was last used; "Connect your agent" is ticked |
| Disconnect | Asks first; the app's next call is refused and it asks to sign in again |
| Cancel on the consent page | Returns to the app with access denied; nothing is connected |
| Paste the setup prompt into Claude Code | It runs `claude mcp add --transport http --scope user …`, then tells you to run `claude mcp login opentax` (it can't sign in for you) and to start a new session |
| New Claude Code session after signing in | Asked to check the account, it calls `my_account` and names the email and the firm's plan |

## 4. A colleague joins

| Step | What should happen |
|---|---|
| Open the invite email | It says who invited them, to which firm, and one line on what OpenTax is |
| Open the link while someone else is signed in | The page says who is signed in and who the invite is for, with a button to sign in as the right person |
| Sign in | The sign-in page says "Sign in to join your team" and the email is filled in and locked |
| Join | The account page says "You've joined [firm]'s Firm plan. Connect your agent below to start." |
| Account as a member | A Member chip, the firm and its owner with the seat count, "Managed by [owner]" in billing, and a set-up list without the invite step |
| Return to Pricing | The card says they're on the firm's plan and the owner manages billing |

## 5. Everyday use

| Step | What should happen |
|---|---|
| API console | "Create key" shows the key once, says it won't be shown again, and puts it into the first-call example |
| Header while signed out | The button says "Sign in" |
| Header while signed in | The button says "Account" |
| Sign out | Returns to the homepage |
| Sign out everywhere | Asks first, then returns to the homepage; other devices are signed out too |
