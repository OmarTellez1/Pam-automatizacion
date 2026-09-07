// Run explicitly against an isolated, visible playwright-cli browser via CDP.
// node scripts/verify-auth-browser.mjs http://127.0.0.1:<CDP-port>
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { authenticatePage, TARGET_ORIGIN } from "../src/auth/session.mjs";
import { generateTotp } from "../src/auth/totp.mjs";

const credentials = { username: "fixture", password: "fixture", totpSecret: "JBSWY3DPEHPK3PXP" };
const html = `<!doctype html><html><body>
<label>Username<input id="username"></label>
<label>Password<input id="password" type="password"></label>
<button id="login">Log In</button>
<section id="challenge" hidden>
  <label>Enter Response<input id="response"></label><button id="submit">Submit</button>
  <p id="rejection" hidden>The provided token was rejected</p>
</section>
<script>
document.querySelector('#login').onclick = () => { document.querySelector('#challenge').hidden = false; };
document.querySelector('#submit').onclick = async () => {
  const message = document.querySelector('#rejection');
  message.hidden = true;
  const response = await fetch('/challenge', {method:'POST',body:document.querySelector('#response').value});
  const result = await response.json();
  if (result.accepted) {
    history.pushState({}, '', '/webconsole/ps/portal');
    setTimeout(() => { document.body.innerHTML = '<a href="/dashboard">Return to dashboard</a>'; }, 200);
  } else { message.hidden = false; }
};
</script></body></html>`;

const browser = await chromium.connectOverCDP(process.argv[2]);
try {
  for (const outcomes of [[true], [false, true], [false, false]]) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      let submitted = 0;
      const page = await context.newPage();
      await context.route('**/*', async route => {
        assert.equal(new URL(route.request().url()).origin, TARGET_ORIGIN);
        if (new URL(route.request().url()).pathname === '/challenge') {
          // All values are synthetic. Check against the server clock, not Windows.
          assert.equal(route.request().postData(), generateTotp(credentials.totpSecret, { timestamp: Date.now() + 67_000 }));
          const accepted = outcomes[submitted++];
          await new Promise(resolve => setTimeout(resolve, 400));
          await route.fulfill({ json: { accepted } });
        } else {
          await route.fulfill({ contentType: 'text/html', headers: {date: new Date(Date.now() + 67_000).toUTCString()}, body: html });
        }
      });
      if (outcomes.at(-1)) {
        await authenticatePage(page, credentials);
        assert.equal(await page.getByRole('link', { name: 'Return to dashboard', exact: true }).isVisible(), true);
      } else {
        await assert.rejects(authenticatePage(page, credentials), error => {
          assert.equal(error.authenticationStage, 'totp');
          assert.match(error.message, /rechazó dos códigos consecutivos/);
          return true;
        });
      }
      assert.equal(submitted, outcomes.length);
      console.log(`PASS: ${JSON.stringify(outcomes)}, TOTP con reloj PAM y mensaje de rechazo reutilizado.`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
