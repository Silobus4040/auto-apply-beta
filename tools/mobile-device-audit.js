const express = require('express');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const workspaceRoot = path.resolve(__dirname, '..');
const defaultPages = ['index.html', 'onboarding.html', 'dashboard.html', 'swipe.html'];
const pages = (process.argv.slice(2).length ? process.argv.slice(2) : defaultPages)
  .map((page) => page.replace(/^\/+/, ''))
  .filter((page) => fs.existsSync(path.join(workspaceRoot, page)));

const androidUserAgent =
  'Mozilla/5.0 (Linux; Android 13; Pixel Build/TQ3A.230805.001) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const deviceMatrix = [
  ['iphone-13', devices['iPhone 13']],
  ['pixel-5', devices['Pixel 5']],
  ['android-small-360x740', {
    viewport: { width: 360, height: 740 },
    userAgent: androidUserAgent,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  }],
  ['galaxy-s21-360x800', {
    viewport: { width: 360, height: 800 },
    userAgent: androidUserAgent,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  }],
  ['android-tablet-800x1280', {
    viewport: { width: 800, height: 1280 },
    userAgent: androidUserAgent,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  }],
].filter(([name, descriptor]) => {
  const filter = process.env.MOBILE_AUDIT_DEVICE;
  return descriptor && (!filter || name.includes(filter));
});

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function slug(input) {
  return input.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

const dashboardStates = [
  {
    name: 'main',
    setup: async () => {},
  },
  {
    name: 'mobile-sidebar',
    setup: async (page) => page.evaluate(() => {
      document.getElementById('app-sidebar')?.classList.add('open');
      document.getElementById('sidebar-overlay')?.classList.add('open');
    }),
  },
  {
    name: 'account-menu',
    setup: async (page) => page.evaluate(() => {
      document.getElementById('app-sidebar')?.classList.add('open');
      document.getElementById('sidebar-account-popover')?.classList.add('active');
    }),
  },
  {
    name: 'inbox',
    setup: async (page) => page.evaluate(() => {
      document.getElementById('email-client-modal')?.classList.add('active');
      document.querySelector('.email-client-container')?.classList.remove('mobile-show-content');
      const intro = document.getElementById('email-mobile-intro');
      if (intro) {
        intro.style.display = '';
        intro.innerHTML = '<div class="email-empty-state"><h3>Dedicated mailbox</h3><p>Mobile audit preview for the inbox menu state.</p></div>';
      }
      const list = document.getElementById('email-list');
      if (list) {
        list.innerHTML = [
          '<div class="email-item unread"><div class="email-sender">recruiter@example.com</div><div class="email-subject">Interview availability for Product Manager</div><div class="email-preview">Thanks for applying. Could you share a few times?</div><div class="email-time">9:41 AM</div></div>',
          '<div class="email-item"><div class="email-sender">jobs@example.com</div><div class="email-subject">Application received</div><div class="email-preview">Your application has been received.</div><div class="email-time">Yesterday</div></div>',
        ].join('');
      }
    }),
  },
  {
    name: 'inbox-detail',
    setup: async (page) => page.evaluate(() => {
      document.getElementById('email-client-modal')?.classList.add('active');
      document.querySelector('.email-client-container')?.classList.add('mobile-show-content');
      const pane = document.getElementById('email-content-pane');
      if (pane) {
        pane.innerHTML = `
          <div style="display:flex; flex-direction:column; height:100%;">
            <div class="email-content-header">
              <button class="email-content-back-btn">Back to Inbox</button>
              <div class="email-content-subject">Interview availability for Senior Product Manager, Growth Platform</div>
              <div class="email-content-meta">
                <div class="email-content-sender">From: recruiter@example.com</div>
                <div class="email-content-date">Sat, Sep 12, 2026 at 9:41 AM</div>
              </div>
            </div>
            <div class="email-iframe-container"><iframe class="email-iframe" srcdoc="<p style='font-family:Arial;padding:16px'>Thanks for applying. Could you share availability next week?</p>"></iframe></div>
          </div>`;
      }
    }),
  },
  {
    name: 'settings',
    setup: async (page) => page.evaluate(() => {
      document.getElementById('settings-modal')?.classList.add('active');
    }),
  },
  {
    name: 'feedback',
    setup: async (page) => page.evaluate(() => {
      document.getElementById('feedback-modal')?.classList.add('active');
    }),
  },
  {
    name: 'skill-gap',
    setup: async (page) => page.evaluate(() => {
      document.getElementById('skill-gap-info-modal')?.classList.add('active');
    }),
  },
  {
    name: 'inbox-setup',
    setup: async (page) => page.evaluate(() => {
      document.getElementById('inbox-modal')?.classList.add('active');
    }),
  },
  {
    name: 'upgrade',
    setup: async (page) => page.evaluate(() => {
      document.getElementById('upgrade-modal')?.classList.add('active');
    }),
  },
  {
    name: 'job-description-modal',
    setup: async (page) => page.evaluate(() => {
      const title = document.getElementById('modal-title');
      const company = document.getElementById('modal-company');
      const text = document.getElementById('modal-text');
      if (title) title.textContent = 'Senior Product Manager, Growth Platform';
      if (company) company.textContent = 'Example Company';
      if (text) text.textContent = 'Own roadmap, work with engineering and design, and improve activation across the customer journey.';
      document.getElementById('desc-modal')?.classList.add('active');
    }),
  },
  {
    name: 'qa-modal',
    setup: async (page) => page.evaluate(() => {
      const company = document.getElementById('qa-company');
      const list = document.getElementById('qa-list');
      if (company) company.textContent = 'Senior Product Manager at Example Company';
      if (list) {
        list.innerHTML = '<div><strong>Are you authorized to work?</strong><p>Yes</p></div><div><strong>Expected salary?</strong><p>Open to market range.</p></div>';
      }
      document.getElementById('qa-modal')?.classList.add('active');
    }),
  },
  {
    name: 'resume-modal',
    setup: async (page) => page.evaluate(() => {
      document.getElementById('resume-modal-title').textContent = 'Resume for Senior Product Manager';
      document.getElementById('resume-modal-company').textContent = 'Example Company';
      document.getElementById('resume-modal-filename').textContent = 'senior-product-manager-tailored-resume.pdf';
      document.getElementById('resume-iframe').srcdoc = '<p style="font-family:Arial;padding:16px">Resume preview audit placeholder</p>';
      document.getElementById('resume-modal')?.classList.add('active');
    }),
  },
];

const staticStates = [{ name: 'main', setup: async () => {} }];

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = require('net').createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function collectLayoutMetrics(page) {
  return page.evaluate(() => {
    function isVisible(el) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0;
    }

    function selectorFor(el) {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const parts = [];
      let node = el;
      while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
        let part = node.nodeName.toLowerCase();
        if (node.classList.length) {
          part += `.${Array.from(node.classList).slice(0, 2).map((c) => CSS.escape(c)).join('.')}`;
        }
        const parent = node.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((child) => child.nodeName === node.nodeName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
        parts.unshift(part);
        node = parent;
      }
      return parts.join(' > ');
    }

    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const scrollingElement = document.scrollingElement || document.documentElement;
    const offenders = Array.from(document.querySelectorAll('body *'))
      .filter(isVisible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          selector: selectorFor(el),
          text: (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 110),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          top: Math.round(rect.top),
          position: window.getComputedStyle(el).position,
        };
      })
      .filter((item) => item.right > viewportWidth + 1 || item.left < -1)
      .filter((item) => item.right > viewportWidth + 1)
      .sort((a, b) => Math.max(b.right - viewportWidth, -b.left) - Math.max(a.right - viewportWidth, -a.left))
      .slice(0, 12);

    return {
      title: document.title,
      url: location.href,
      viewportWidth,
      viewportHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body ? document.body.scrollWidth : 0,
      pageScrollWidth: scrollingElement.scrollWidth,
      horizontalOverflow: Math.max(
        0,
        document.documentElement.scrollWidth - viewportWidth,
        document.body ? document.body.scrollWidth - viewportWidth : 0,
        scrollingElement.scrollWidth - viewportWidth,
      ),
      pageScrollHeight: scrollingElement.scrollHeight,
      offenders,
    };
  });
}

async function resetPageState(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay.active').forEach((el) => el.classList.remove('active'));
    document.getElementById('app-sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
    document.getElementById('sidebar-account-popover')?.classList.remove('active');
    document.querySelector('.email-client-container')?.classList.remove('mobile-show-content', 'is-composing');
    window.scrollTo(0, 0);
  });
}

async function run() {
  if (!pages.length) {
    throw new Error('No target pages found. Pass one or more HTML files to audit.');
  }

  const app = express();
  app.use(express.static(workspaceRoot));
  const port = await getFreePort();
  const server = await new Promise((resolve) => {
    const listener = app.listen(port, '127.0.0.1', () => resolve(listener));
  });

  const outDir = path.join(workspaceRoot, 'mobile-audit', timestamp());
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const [deviceName, descriptor] of deviceMatrix) {
      const context = await browser.newContext({
        ...descriptor,
        colorScheme: 'light',
        reducedMotion: 'reduce',
        ignoreHTTPSErrors: true,
      });
      await context.route('**/*', (route) => {
        const requestUrl = route.request().url();
        if (requestUrl.startsWith(`http://127.0.0.1:${port}/`)) {
          route.continue();
          return;
        }
        route.abort();
      });

      for (const pagePath of pages) {
        const page = await context.newPage();
        const messages = [];
        page.on('console', (msg) => {
          if (['error', 'warning'].includes(msg.type())) messages.push(`${msg.type()}: ${msg.text()}`);
        });
        page.on('pageerror', (err) => messages.push(`pageerror: ${err.message}`));

        const states = pagePath === 'dashboard.html' ? dashboardStates : staticStates;

        for (const state of states) {
          const url = `http://127.0.0.1:${port}/${pagePath}`;
          const screenshotName = `${slug(pagePath)}--${state.name}--${deviceName}.png`;
          const screenshotPath = path.join(outDir, screenshotName);
          let metrics;
          let loadError = null;

          try {
            console.log(`[${deviceName}] ${pagePath} / ${state.name}`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(250);
            await resetPageState(page);
            await state.setup(page);
            await page.waitForTimeout(150);
            metrics = await collectLayoutMetrics(page);
            await page.screenshot({ path: screenshotPath, fullPage: false });
          } catch (error) {
            loadError = error.message;
          }

          results.push({
            page: pagePath,
            state: state.name,
            device: deviceName,
            screenshot: screenshotName,
            loadError,
            consoleMessages: messages.slice(0, 20),
            metrics,
          });
        }

        await page.close();
      }

      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const jsonPath = path.join(outDir, 'report.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), pages, results }, null, 2));

  const lines = [
    '# Mobile Device Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Pages: ${pages.join(', ')}`,
    '',
    '| Page | State | Device | Overflow | Screenshot | Notes |',
    '| --- | --- | --- | ---: | --- | --- |',
  ];

  for (const result of results) {
    const overflow = result.metrics ? `${result.metrics.horizontalOverflow}px` : 'n/a';
    const notes = result.loadError
      ? `Load error: ${result.loadError.replace(/\|/g, '\\|')}`
      : result.metrics.horizontalOverflow > 0 && result.metrics.offenders.length
        ? `${result.metrics.offenders.length} overflow candidate(s)`
        : 'ok';
    lines.push(`| ${result.page} | ${result.state} | ${result.device} | ${overflow} | ${result.screenshot} | ${notes} |`);
  }

  lines.push('', '## Overflow Candidates', '');
  for (const result of results.filter((item) => item.metrics && item.metrics.horizontalOverflow > 0 && item.metrics.offenders.length)) {
    lines.push(`### ${result.page} / ${result.state} / ${result.device}`, '');
    for (const offender of result.metrics.offenders.slice(0, 6)) {
      lines.push(`- ${offender.selector} right=${offender.right}, left=${offender.left}, width=${offender.width}: ${offender.text || '(no text)'}`);
    }
    lines.push('');
  }

  const markdownPath = path.join(outDir, 'report.md');
  fs.writeFileSync(markdownPath, lines.join('\n'));

  console.log(`Mobile audit complete: ${outDir}`);
  console.log(`Report: ${markdownPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
