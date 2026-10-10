# Secret Santa

A very simple Secret Santa website with shared wishlists. Spanish by default, with a
button to switch to English.

It is designed so that anyone can use it, including people who are not comfortable with
computers: one question per screen, big text, big buttons, few words. The look follows
Material You (soft colours, round shapes, calm animations; animations are switched off for
people who asked their device for reduced motion). The person you give a gift to is shown
in a large highlighted card and marked in the wishlist list.

## How it works

**You (the host)**

1. Open `/host.html` on your site.
2. Type all names, one per line.
3. Optional: add rules such as "Aunt and Uncle should not give to each other".
4. Type your host password, press **Draw names and create the link**, and send the link to everybody.

The draw happens on the server. Nobody, not even you, sees who gives to whom, so you can
take part yourself.

**Your guests**

1. Open the link and start typing their name. The page suggests matching names.
2. Confirm "Yes, that is me".
3. See who they give a gift to, then press "I am done" so the screen is hidden again.
4. The host page also has **Shuffle again**: it draws new pairings for the same event.
   The link and everybody's wishlists stay; the rules you set are reused. (Anyone who
   already looked at their person has to look again.)
5. Optional: open **Wishlists** to read what the others wrote, or **My wishlist** to write
   ideas. It is one box with three buttons: bold, italic and a bullet list. Paste a link on
   its own and it becomes a preview card (picture, title, description) like in a chat app;
   links inside a sentence stay normal clickable links. Everyone taking part can read
   everybody's wishlist.

## Put it online (Vercel + free Redis)

The site is static files plus one small function (`api/santa.js`). The data (names, pairings
and wishlists) lives in a Redis database.

1. **Import the project** on [vercel.com](https://vercel.com): New Project, pick this repository.
   No build settings are needed; `vercel.json` tells Vercel to serve the `public/` folder.
2. **Add a database:** in the project, open the *Storage* tab (or the Marketplace) and add
   *Upstash Redis*, connected to this project. Vercel adds the connection variables for you.
   The app reads either `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` or
   `KV_REST_API_URL` + `KV_REST_API_TOKEN`.
3. **Set the host password:** *Settings → Environment Variables*, add `HOST_PASSWORD` with a
   password only you know.
4. **Redeploy** so the new variables are picked up (*Deployments → Redeploy*).
5. Open `https://<your-project>.vercel.app/host.html`.

(Menu names in the Vercel dashboard can differ slightly. If the host page says the server
has no password or no database yet, one of the steps above is missing.)

## Try it on your computer

```
node dev-server.js
```

Then open <http://localhost:3000/host.html>. The host password is `dev` (or whatever you set
in `HOST_PASSWORD`). Data is kept in memory and disappears when you stop the server. Needs
Node 20 or newer, nothing to install.

## Good to know

- **Honor system:** anyone who has the link can type any name from the list, see that
  person's recipient and edit that person's wishlist. That matches how a family Secret Santa
  works, so only send the link to people taking part.
- **Pairings stay on the server.** The browser only receives the recipient of the one person
  who confirmed their name. The link contains only a random event number.
- **Wishlists are public to the group.** Older wishlists that had a separate link list are
  merged into the text the next time their owner opens them.
- **Link previews:** the server fetches the linked page to read its title, description and
  picture. It only talks to public web addresses (internal addresses, odd protocols, big
  pages and endless redirects are refused). Some shops block such requests, then the card
  just shows the site name. Pictures are loaded from the shop's own site (`img-src https:`).
- **Host password:** only the host page's "draw" needs it. Wrong guesses are slowed down.
- **Drawing again** creates a new event with empty wishlists. Old links keep working with
  their old draw.
- **Data expires** 120 days after it was last saved.
- Only normal `http(s)` links are accepted in wishlists (checked in the browser and again on
  the server), and the site sends a strict Content-Security-Policy.
- Names are matched without caring about capital letters or accents
  (typing "muller" finds "Müller", "jose" finds "José").
- All texts live in `public/i18n.js`.

## Files

| File | Purpose |
| --- | --- |
| `public/index.html`, `public/guest.js` | The page your guests use |
| `public/host.html`, `public/host.js` | The page you use to set up and draw |
| `public/rich.js` | Wishlist formatting (bold, italic, list) and link cards |
| `server/preview.js` | Fetches link previews safely |
| `public/shared.js` | Drawing logic, name matching, link cleaning (used by browser and server) |
| `public/i18n.js` | All texts in Spanish and English, language button |
| `public/api.js` | Browser side of the server calls |
| `public/style.css` | Look and feel (Material You, large text, high contrast) |
| `api/santa.js` | The Vercel function |
| `server/handler.js` | The whole API (create, names, reveal, wishlists, save) |
| `server/store.js` | Storage: Upstash Redis, or memory for local use |
| `dev-server.js` | Local server for trying things out |
| `vercel.json` | Vercel settings and security headers |
| `test/` | Automated tests |

## Tests

```
npm test
```

Checks the drawing logic, the API (including host password, malformed requests and wishlist
cleaning), the Redis commands, and that Spanish and English are complete.
