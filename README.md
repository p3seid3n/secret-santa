# Secret Santa

A very small, very simple Secret Santa website. Plain HTML, CSS and JavaScript:
no server, no accounts, no tracking, nothing to install.

It is designed so that anyone can use it, including people who are not
comfortable with computers: one question per screen, big text, big buttons,
plain words.

## How it works

**You (the host)**

1. Open `host.html`.
2. Type all names, one per line. The page remembers them in your browser.
3. Optional: add rules such as "Aunt and Uncle should not give to each other".
4. Press **Draw names and create the link** and send the link to everybody.

**Your guests**

1. Open the link and start typing their name. The page suggests matching names.
2. Confirm "Yes, that is me".
3. See who they give a gift to, then press "I am done" so the screen is hidden again.
4. Optional: open "My wishlist" for notes and links, and copy it to send to someone.

## Put it online

The site is just static files, there is no build step.

- **GitHub Pages**: Settings → Pages → deploy from branch `main`, folder `/ (root)`.
  (Free accounts need a public repository for this.)
- **Vercel / Netlify / Cloudflare Pages**: import the repository and deploy with
  the default settings. These also work with private repositories.

The host page is then at `https://<your-site>/host.html`.

## Good to know

- **Where the draw lives:** inside the link itself (the part after `#`). It is never
  sent to a server. Everyone who has the link can type any name, so the link should
  only go to the people taking part.
- **Not a vault:** the draw is encoded, not encrypted. It stops accidental peeking,
  but someone who knows how to decode the link could read all pairings. That is
  fine for family and friends, not for a high-stakes secret.
- **Wishlists and notes** are saved only in the browser of the person who writes
  them. They are not uploaded anywhere, which is why there is a "Copy my wishlist"
  button.
- **Drawing again** creates a new link. Old links keep working with their old draw,
  so only share the newest one.
- Names are matched without caring about capital letters or accents
  (typing "muller" finds "Müller").

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `guest.js` | The page your guests use |
| `host.html`, `host.js` | The page you use to set up and draw |
| `shared.js` | Drawing logic, name matching, link encoding |
| `style.css` | Look and feel (large text, high contrast) |
| `test/draw.test.js` | Tests for the drawing logic |

## Tests

```
node test/draw.test.js
```
