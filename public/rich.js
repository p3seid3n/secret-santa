/*
 * Secret Santa – the wishlist text.
 *
 * A wishlist is saved as plain text with three tiny marks:
 *   **bold**   *italic*   and lines that start with "- " for a bullet list.
 * A line that contains only a web address is shown as a preview card (picture, title,
 * description). A backslash switches off the next mark: \* is a real star.
 *
 * This file turns that text into page elements and back. Only bold, italic, one list type,
 * web links and cards can ever appear, whatever somebody pastes. No HTML is ever inserted
 * as text: elements are built one by one.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./shared.js"));
  } else {
    root.SantaRich = factory(root.SantaCore);
  }
})(typeof self !== "undefined" ? self : this, function (Core) {
  "use strict";

  /* ------------------------------------------------- Text <-> blocks (pure) */

  // blocks: { type: "p", runs }, { type: "ul", items: [runs] }, { type: "card", url }
  // run: { text, bold, italic, url? }

  function parseInline(line) {
    var runs = [];
    var bold = false;
    var italic = false;
    var buffer = "";
    function push() {
      if (buffer) runs.push({ text: buffer, bold: bold, italic: italic });
      buffer = "";
    }
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      var next = line.charAt(i + 1);
      if (c === "\\" && (next === "*" || next === "\\" || next === "-")) {
        buffer += next;
        i++;
      } else if (c === "*" && next === "*") {
        push();
        bold = !bold;
        i++;
      } else if (c === "*") {
        push();
        italic = !italic;
      } else {
        buffer += c;
      }
    }
    push();

    // Web addresses inside the text become links.
    var out = [];
    runs.forEach(function (run) {
      Core.linkify(run.text).forEach(function (part) {
        var item = { text: part.text, bold: run.bold, italic: run.italic };
        if (part.url) item.url = part.url;
        out.push(item);
      });
    });
    return out;
  }

  // Returns the web address when the whole line is nothing but one address.
  function loneUrl(line) {
    var trimmed = line.trim();
    if (!trimmed || /\s/.test(trimmed)) return null;
    var parts = Core.linkify(trimmed);
    return parts.length === 1 && parts[0].url && parts[0].text === trimmed ? parts[0].url : null;
  }

  function parse(text) {
    var blocks = [];
    String(text || "").replace(/\r\n/g, "\n").split("\n").forEach(function (line) {
      if (/^- /.test(line)) {
        var last = blocks[blocks.length - 1];
        if (!last || last.type !== "ul") {
          last = { type: "ul", items: [] };
          blocks.push(last);
        }
        last.items.push(parseInline(line.slice(2)));
        return;
      }
      var url = loneUrl(line);
      blocks.push(url ? { type: "card", url: url } : { type: "p", runs: parseInline(line) });
    });
    return blocks;
  }

  function escapeText(text) {
    return text.replace(/\\/g, "\\\\").replace(/\*/g, "\\*");
  }

  function runsToText(runs) {
    var out = "";
    runs.forEach(function (run) {
      if (!run.text) return;
      out += (run.bold ? "**" : "") + (run.italic ? "*" : "") + escapeText(run.text) +
             (run.italic ? "*" : "") + (run.bold ? "**" : "");
    });
    return out;
  }

  // A line must not start with "- " unless it is a list item.
  function escapeLead(text) {
    return text.charAt(0) === "-" ? "\\" + text : text;
  }

  function stringify(blocks) {
    var lines = [];
    blocks.forEach(function (block) {
      if (block.type === "card") {
        lines.push(block.url);
      } else if (block.type === "ul") {
        block.items.forEach(function (runs) {
          var text = runsToText(runs);
          if (text) lines.push("- " + escapeLead(text));
        });
      } else {
        lines.push(escapeLead(runsToText(block.runs)));
      }
    });
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.join("\n");
  }

  /* ------------------------------------------------------ Blocks -> elements */

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function runNode(run, editable) {
    var node = document.createTextNode(run.text);
    if (run.italic) { var i = el("i"); i.appendChild(node); node = i; }
    if (run.bold) { var b = el("b"); b.appendChild(node); node = b; }
    if (run.url && !editable) {
      var a = el("a");
      a.href = run.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.appendChild(node);
      node = a;
    }
    return node;
  }

  function fillRuns(parent, runs, editable) {
    runs.forEach(function (run) { parent.appendChild(runNode(run, editable)); });
    if (!parent.firstChild) parent.appendChild(el("br"));
  }

  // The preview card. Read-only cards are one big link, editable ones a box with a remove button.
  function makeCard(url, editable, removeLabel) {
    var card = el(editable ? "div" : "a", "card loading");
    card.setAttribute("data-url", url);
    if (editable) {
      card.setAttribute("contenteditable", "false");
    } else {
      card.href = url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
    }
    var picture = el("div", "card-picture");
    picture.hidden = true;
    var body = el("div", "card-body");
    var title = el("span", "card-title");
    title.textContent = Core.hostName(url);
    var description = el("span", "card-desc");
    description.hidden = true;
    var site = el("span", "card-site");
    site.textContent = Core.hostName(url);
    body.appendChild(title);
    body.appendChild(description);
    body.appendChild(site);
    card.appendChild(picture);
    card.appendChild(body);
    if (editable) {
      var remove = el("button", "card-remove");
      remove.type = "button";
      remove.textContent = removeLabel || "×";
      card.appendChild(remove);
    }
    return card;
  }

  // preview: { title, description, image, site } or null when nothing could be found.
  function fillCard(card, preview) {
    card.classList.remove("loading");
    if (!preview) return;
    var picture = card.querySelector(".card-picture");
    var title = card.querySelector(".card-title");
    var description = card.querySelector(".card-desc");
    var site = card.querySelector(".card-site");
    if (preview.title) title.textContent = preview.title;
    if (preview.description) {
      description.textContent = preview.description;
      description.hidden = false;
    }
    if (preview.site) site.textContent = preview.site;
    var image = preview.image && Core.cleanUrl(preview.image);
    if (image && image.indexOf("https:") === 0) {
      var img = el("img");
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", function () { picture.hidden = true; picture.textContent = ""; });
      img.src = image;
      picture.textContent = "";
      picture.appendChild(img);
      picture.hidden = false;
    }
  }

  // Fills a container with the elements for a wishlist text.
  // options: { editable, removeLabel, onCard(cardElement, url) }
  function render(container, text, options) {
    options = options || {};
    var editable = !!options.editable;
    container.textContent = "";
    parse(text).forEach(function (block) {
      var node;
      if (block.type === "card") {
        node = makeCard(block.url, editable, options.removeLabel);
        if (options.onCard) options.onCard(node, block.url);
      } else if (block.type === "ul") {
        node = el("ul");
        block.items.forEach(function (runs) {
          var li = el("li");
          fillRuns(li, runs, editable);
          node.appendChild(li);
        });
      } else {
        node = el("p");
        fillRuns(node, block.runs, editable);
      }
      container.appendChild(node);
    });
    if (editable) ensureEditorShape(container);
  }

  /* ------------------------------------------------------ Elements -> text */

  function isBoldStyle(node) {
    var w = node.style && node.style.fontWeight;
    return w === "bold" || w === "bolder" || (w && parseInt(w, 10) >= 600);
  }

  function inlineRuns(node, bold, italic, out) {
    if (node.nodeType === 3) {
      var text = node.nodeValue.replace(/ /g, " ").replace(/[\r\n]+/g, " ");
      if (text) out.push({ text: text, bold: bold, italic: italic });
      return out;
    }
    if (node.nodeType !== 1) return out;
    var tag = node.tagName;
    if (tag === "BR") return out;
    var b = bold || tag === "B" || tag === "STRONG" || isBoldStyle(node);
    var i = italic || tag === "I" || tag === "EM" || (node.style && node.style.fontStyle === "italic");
    for (var c = node.firstChild; c; c = c.nextSibling) inlineRuns(c, b, i, out);
    return out;
  }

  function mergeRuns(runs) {
    var out = [];
    runs.forEach(function (run) {
      var last = out[out.length - 1];
      if (last && last.bold === run.bold && last.italic === run.italic) last.text += run.text;
      else out.push({ text: run.text, bold: run.bold, italic: run.italic });
    });
    return out;
  }

  function domToBlocks(container) {
    var blocks = [];
    var loose = null;
    function flush() {
      if (loose) blocks.push({ type: "p", runs: mergeRuns(loose) });
      loose = null;
    }
    for (var node = container.firstChild; node; node = node.nextSibling) {
      var tag = node.nodeType === 1 ? node.tagName : "";
      if (tag && node.classList.contains("card")) {
        flush();
        var url = node.getAttribute("data-url");
        if (url && Core.cleanUrl(url)) blocks.push({ type: "card", url: Core.cleanUrl(url) });
      } else if (tag === "UL" || tag === "OL") {
        flush();
        var items = [];
        for (var li = node.firstChild; li; li = li.nextSibling) {
          if (li.nodeType === 1) items.push(mergeRuns(inlineRuns(li, false, false, [])));
        }
        blocks.push({ type: "ul", items: items });
      } else if ((tag === "P" || tag === "DIV") && node.querySelector("ul, ol")) {
        // Browsers sometimes put a list inside a paragraph: read what is inside.
        flush();
        domToBlocks(node).forEach(function (inner) { blocks.push(inner); });
      } else if (tag === "P" || tag === "DIV" || /^H[1-6]$/.test(tag)) {
        flush();
        blocks.push({ type: "p", runs: mergeRuns(inlineRuns(node, false, false, [])) });
      } else {
        loose = loose || [];
        inlineRuns(node, false, false, loose);
      }
    }
    flush();
    return blocks;
  }

  function serialize(container) {
    return stringify(domToBlocks(container));
  }

  /* ------------------------------------------------------------- The editor */

  function emptyParagraph() {
    var p = el("p");
    p.appendChild(el("br"));
    return p;
  }

  // The editor always holds at least one paragraph, and a card is always followed by one,
  // so there is somewhere to type after it.
  function ensureEditorShape(editor) {
    if (!editor.firstChild) editor.appendChild(emptyParagraph());
    var last = editor.lastElementChild;
    if (last && last.classList.contains("card")) editor.appendChild(emptyParagraph());
    editor.classList.toggle("is-empty", isBlank(editor));
  }

  function isBlank(editor) {
    return !editor.querySelector(".card") && !editor.textContent.trim() && !editor.querySelector("li");
  }

  function placeCaret(node) {
    var range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(true);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function topBlock(editor, node) {
    while (node && node.parentNode !== editor) node = node.parentNode;
    return node;
  }

  function insertCard(editor, url, options) {
    var sel = window.getSelection();
    var block = sel && sel.rangeCount && editor.contains(sel.anchorNode) ? topBlock(editor, sel.anchorNode) : null;
    var card = makeCard(url, true, options.removeLabel);
    if (block && block.tagName === "P" && !block.textContent.trim()) {
      editor.replaceChild(card, block);
    } else if (block) {
      editor.insertBefore(card, block.nextSibling);
    } else {
      editor.appendChild(card);
    }
    ensureEditorShape(editor);
    if (options.onCard) options.onCard(card, url);
    placeCaret(card.nextElementSibling);
  }

  // Wires up an editor: paste (plain text only, a lone address becomes a card),
  // the three format buttons, removing cards. options: { onChange, onCard, removeLabel }
  function attachEditor(editor, buttons, options) {
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) { /* ignore */ }

    function changed() {
      ensureEditorShape(editor);
      if (options.onChange) options.onChange();
    }

    editor.addEventListener("input", function () {
      // Text typed straight into the editor (no paragraph yet) gets one.
      if (editor.firstChild && editor.firstChild.nodeType === 3) {
        try { document.execCommand("formatBlock", false, "p"); } catch (e) { /* ignore */ }
      }
      changed();
    });

    editor.addEventListener("paste", function (event) {
      event.preventDefault();
      var data = event.clipboardData || window.clipboardData;
      var text = data ? String(data.getData("text/plain") || data.getData("Text") || "") : "";
      text = text.replace(/\r\n/g, "\n");
      if (!text) return;
      var url = loneUrl(text);
      if (url) {
        insertCard(editor, url, options);
        changed();
        return;
      }
      text.split("\n").forEach(function (line, index) {
        if (index > 0) document.execCommand("insertParagraph");
        if (line) document.execCommand("insertText", false, line);
      });
      changed();
    });

    editor.addEventListener("drop", function (event) { event.preventDefault(); });

    editor.addEventListener("click", function (event) {
      var target = event.target;
      if (target && target.classList && target.classList.contains("card-remove")) {
        var card = target.closest(".card");
        if (card) card.parentNode.removeChild(card);
        changed();
      }
    });

    var commands = { bold: "bold", italic: "italic", list: "insertUnorderedList" };
    Object.keys(commands).forEach(function (name) {
      var button = buttons[name];
      if (!button) return;
      // Keep the cursor in the text when a button is pressed.
      button.addEventListener("mousedown", function (event) { event.preventDefault(); });
      button.addEventListener("click", function () {
        editor.focus();
        document.execCommand(commands[name]);
        changed();
        refreshButtons();
      });
    });

    function refreshButtons() {
      var sel = window.getSelection();
      var inside = sel && sel.rangeCount && editor.contains(sel.anchorNode);
      Object.keys(commands).forEach(function (name) {
        var button = buttons[name];
        if (!button) return;
        var on = false;
        try { on = !!inside && document.queryCommandState(commands[name]); } catch (e) { on = false; }
        button.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    document.addEventListener("selectionchange", refreshButtons);
  }

  return {
    parse: parse,
    stringify: stringify,
    escapeText: escapeText,
    render: render,
    serialize: serialize,
    fillCard: fillCard,
    attachEditor: attachEditor,
    ensureEditorShape: ensureEditorShape
  };
});
