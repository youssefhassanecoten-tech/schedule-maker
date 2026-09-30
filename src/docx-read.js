/* Schedule Maker - read the department grid out of a .docx file.
 *
 * Input layout (Raspisanie_versia_N.docx):
 *   table, row 0 : [corner][Понедельник][Вторник]...[Суббота]   (cells use gridSpan)
 *   table, row 1 : [corner][time label] x 14
 *   table, row N : [teacher][cell] x 14
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});

  var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var NS = 'http://www.w3.org/2000/xmlns/';

  function getParser() {
    if (typeof DOMParser !== 'undefined') return new DOMParser();
    if (global.SM && global.SM.__xmlParser) return global.SM.__xmlParser;
    throw new Error('No XML parser available');
  }

  function parseXml(xmlText) {
    var doc = getParser().parseFromString(xmlText, 'application/xml');
    var err = doc.querySelector && doc.querySelector('parsererror');
    if (err) throw new Error('Invalid document.xml: ' + err.textContent);
    return doc;
  }

  function tag(node) {
    var n = node.nodeName;
    if (n.indexOf(':') > 0) n = n.slice(n.indexOf(':') + 1);
    return n;
  }

  function descendants(node, name) {
    var out = [], stack = [node];
    while (stack.length) {
      var cur = stack.pop();
      var kids = cur.childNodes || [];
      for (var i = kids.length - 1; i >= 0; i--) {
        var k = kids[i];
        if (k.nodeType !== 1) continue;
        if (tag(k) === name) out.push(k);
        else stack.push(k);
      }
    }
    return out;
  }

  function childrenByTag(node, name) {
    var out = [];
    for (var c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1 && tag(c) === name) out.push(c);
    }
    return out;
  }

  /* Direct children of `w:p` that are `w:t` (skips deleted text, instrText, etc.) */
  function cellText(tc) {
    var ps = childrenByTag(tc, 'p');
    var out = [];
    for (var i = 0; i < ps.length; i++) {
      var runs = childrenByTag(ps[i], 'r');
      var txt = '';
      for (var j = 0; j < runs.length; j++) {
        var ts = childrenByTag(runs[j], 't');
        for (var k = 0; k < ts.length; k++) {
          if (ts[k].firstChild) txt += ts[k].firstChild.nodeValue;
        }
        // tabs and breaks
        var tabs = childrenByTag(runs[j], 'tab');
        for (var q = 0; q < tabs.length; q++) txt += ' ';
      }
      out.push(txt);
    }
    return out.join('\n');
  }

  function cellShading(tc) {
    var pr = childrenByTag(tc, 'tcPr')[0];
    if (!pr) return '';
    var shd = childrenByTag(pr, 'shd')[0];
    if (!shd) return '';
    return shd.getAttributeNS(NS, 'fill') || shd.getAttribute('w:fill') || '';
  }

  function attr(el, name) {
    var v = el.getAttributeNS(NS, name);
    if (v === null || v === undefined) v = el.getAttribute('w:' + name);
    return v === null || v === undefined ? '' : v;
  }

  function gridSpan(tc) {
    var pr = childrenByTag(tc, 'tcPr')[0];
    if (!pr) return 1;
    var gs = childrenByTag(pr, 'gridSpan')[0];
    return gs ? Math.max(1, parseInt(attr(gs, 'val'), 10) || 1) : 1;
  }

  /* Expand a row so every logical column is represented (honouring gridSpan). */
  function expandRow(tr, totalCols) {
    var cells = childrenByTag(tr, 'tc');
    var out = [];
    for (var i = 0; i < cells.length; i++) {
      var span = gridSpan(cells[i]);
      var item = { text: cellText(cells[i]), fill: cellShading(cells[i]), span: span };
      out.push(item);
      for (var s = 1; s < span; s++) out.push(null); // placeholders keep column alignment
    }
    while (totalCols && out.length < totalCols) out.push(null);
    return out;
  }

  /*
   * Load a .docx ArrayBuffer / Uint8Array and return
   *   { title, teachers: [{name, cells:[14 strings], fills:[14]}], warnings: [] }
   */
  function readDocx(input) {
    var warnings = [];
    return Promise.resolve(global.JSZip ? global.JSZip.loadAsync(input) : null)
      .then(function (zip) {
        if (!zip) throw new Error('JSZip is not loaded');
        return zip.file('word/document.xml').async('string');
      })
      .then(function (xml) {
        var doc = parseXml(xml);
        var body = descendants(doc.documentElement, 'body')[0];
        var tables = childrenByTag(body, 'tbl');
        if (!tables.length) throw new Error('No table found in the document');

        // Pick the table with the most rows that look like a teacher grid.
        var best = null;
        tables.forEach(function (tbl) {
          var rows = childrenByTag(tbl, 'tr');
          if (rows.length >= (best ? best.rows.length : 0)) best = { tbl: tbl, rows: rows };
        });

        var rows = best.rows;
        var paragraphs = [];
        childrenByTag(best.tbl, 'p').forEach(function () {});
        // Title paragraphs live before the table.
        var titleParts = [];
        for (var c = body.firstChild; c; c = c.nextSibling) {
          if (c.nodeType !== 1) continue;
          if (tag(c) === 'tbl') break;
          if (tag(c) === 'p') {
            var t = '';
            var runs = childrenByTag(c, 'r');
            for (var i = 0; i < runs.length; i++) {
              var ts = childrenByTag(runs[i], 't');
              for (var j = 0; j < ts.length; j++) if (ts[j].firstChild) t += ts[j].firstChild.nodeValue;
            }
            if (SM.util.flat(t)) titleParts.push(SM.util.flat(t));
          }
        }

        // Row 0 = day names, row 1 = time labels, remaining rows = teachers.
        var gridRows = rows.map(function (tr) { return expandRow(tr, 0); });
        var teachers = [];
        var teacherRows = 0;

        for (var r = 2; r < gridRows.length; r++) {
          var row = gridRows[r];
          var name = row[0] ? SM.util.flat(row[0].text) : '';
          if (!name) continue;
          var cells = [];
          var fills = [];
          for (var c2 = 1; c2 < SM.config.SLOT_COUNT + 1; c2++) {
            var cell = row[c2];
            cells.push(cell ? cell.text : '');
            fills.push(cell ? cell.fill : '');
          }
          if (row.length - 1 !== SM.config.SLOT_COUNT) {
            warnings.push('Row "' + name + '" has ' + (row.length - 1) +
                          ' columns instead of ' + SM.config.SLOT_COUNT);
          }
          teachers.push({ name: name, cells: cells, fills: fills, sourceIndex: teachers.length });
          teacherRows++;
        }

        if (!teachers.length) throw new Error('No teacher rows found in the grid');

        return {
          title: titleParts.join(' '),
          titleParts: titleParts,
          teachers: teachers,
          warnings: warnings
        };
      });
  }

  SM.docxRead = {
    readDocx: readDocx,
    parseXml: parseXml,
    _internals: { childrenByTag: childrenByTag, descendants: descendants, cellText: cellText }
  };

})(typeof window !== 'undefined' ? window : globalThis);
