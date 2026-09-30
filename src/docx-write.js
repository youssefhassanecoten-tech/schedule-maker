/* Schedule Maker - minimal WordprocessingML (.docx) writer.
 *
 * Produces documents that open in Word / LibreOffice / Google Docs with the same
 * layout as the department's originals: Times New Roman, bordered tables,
 * horizontally merged day headers, shaded columns.
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\u0007/g, '');
  }

  /* Split text on \n into several runs separated by <w:br/> */
  function runs(text, o) {
    o = o || {};
    var rPr = '<w:rPr>' +
      (o.font ? '<w:rFonts w:ascii="' + esc(o.font) + '" w:hAnsi="' + esc(o.font) + '" w:cs="' + esc(o.font) + '"/>' : '') +
      (o.bold ? '<w:b/>' : '') +
      (o.italic ? '<w:i/>' : '') +
      (o.underline ? '<w:u w:val="single"/>' : '') +
      '<w:sz w:val="' + (o.size || 16) + '"/><w:szCs w:val="' + (o.size || 16) + '"/>' +
      (o.color ? '<w:color w:val="' + esc(o.color) + '"/>' : '') +
      '</w:rPr>';
    var parts = String(text == null ? '' : text).split('\n');
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      out += '<w:r>' + rPr + '<w:t xml:space="preserve">' + esc(parts[i]) + '</w:t></w:r>';
      if (i < parts.length - 1) out += '<w:r>' + rPr + '<w:br/></w:r>';
    }
    return out;
  }

  function Doc(opts) {
    opts = opts || {};
    this.items = [];
    this.page = Object.assign({
      orient: opts.orient || 'portrait',
      size: opts.size || 'A4',
      margin: opts.margin != null ? opts.margin : 720
    }, opts.page || {});
    this.defaultSize = opts.defaultSize || 16;
    this.font = opts.font || 'Times New Roman';
  }

  var SIZES = {
    A4: { w: 11906, h: 16838 },
    A3: { w: 16838, h: 23811 },
    A5: { w: 8391, h: 11906 }
  };

  Doc.prototype.para = function (text, o) {
    o = o || {};
    var pPr = '<w:pPr>' +
      (o.align ? '<w:jc w:val="' + o.align + '"/>' : '') +
      '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after || 0) + '"/>' +
      '<w:rPr><w:sz w:val="' + (o.size || this.defaultSize) + '"/></w:rPr>' +
      '</w:pPr>';
    this.items.push('<w:p>' + pPr + runs(text || '', {
      font: this.font, size: o.size || this.defaultSize, bold: o.bold,
      italic: o.italic, underline: o.underline
    }) + '</w:p>');
    return this;
  };

  Doc.prototype.empty = function (size) {
    return this.para('', { size: size || this.defaultSize });
  };

  /* The table is kept as an object and serialised when the document is written,
   * so that rows can still be added after this call. */
  Doc.prototype.table = function (cfg) {
    var t = new Table(this, cfg);
    this.items.push(t);
    return t;
  };

  Doc.prototype.sectPr = function () {
    var s = SIZES[this.page.size] || SIZES.A4;
    var w = this.page.orient === 'landscape' ? s.h : s.w;
    var h = this.page.orient === 'landscape' ? s.w : s.h;
    var m = this.page.margin;
    return '<w:sectPr>' +
      '<w:pgSz w:w="' + w + '" w:h="' + h + '" w:orient="' + this.page.orient + '"/>' +
      '<w:pgMar w:top="' + m + '" w:right="' + m + '" w:bottom="' + m + '" w:left="' + m +
      '" w:header="360" w:footer="360" w:gutter="0"/>' +
      '<w:cols w:space="708"/><w:docGrid w:linePitch="360"/>' +
      '</w:sectPr>';
  };

  Doc.prototype.toXml = function () {
    var self = this;
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<w:body>' +
      this.items.map(function (it) { return typeof it === 'string' ? it : it.toXml(); }).join('') +
      this.sectPr() + '</w:body></w:document>';
  };

  Doc.prototype.toBlob = function (zipLib, outType) {
    var JSZip = zipLib || global.JSZip;
    var type = outType || (typeof document !== 'undefined' ? 'blob' : 'nodebuffer');
    var zip = new JSZip();
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>');
    zip.folder('_rels').file('.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>');
    zip.folder('word').file('document.xml', this.toXml());
    zip.folder('word').file('styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' +
      '<w:sz w:val="' + this.defaultSize + '"/><w:szCs w:val="' + this.defaultSize + '"/>' +
      '</w:rPr></w:rPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
      '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' +
      '<w:sz w:val="' + this.defaultSize + '"/></w:rPr></w:style>' +
      '</w:styles>');
    zip.folder('word').folder('_rels').file('document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>');
    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    zip.folder('docProps').file('core.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>Schedule</dc:title><dc:creator>Schedule Maker</dc:creator>' +
      '<cp:lastModifiedBy>Schedule Maker</cp:lastModifiedBy>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' +
      '</cp:coreProperties>');
    zip.folder('docProps').file('app.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
      '<Application>Schedule Maker</Application></Properties>');
    return zip.generateAsync({
      type: type,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
  };

  /* ---------------------------------------------------------------- */

  function Table(doc, cfg) {
    this.doc = doc;
    this.cols = cfg.cols;                 // array of column widths in twips
    this.align = cfg.align || 'center';
    this.borders = cfg.borders !== false;
    this.rows = [];
    this.rowHeights = [];
    this._last = null;
  }

  Table.prototype.row = function () {
    this._last = { cells: [] };
    this.rows.push(this._last);
    return new RowHandle(this._last);
  };

  function RowHandle(row) {
    this.row = row;
  }
  RowHandle.prototype.cell = function (cfg) {
    cfg = cfg || {};
    this.row.cells.push(cfg);
    return this;
  };

  Table.prototype.toXml = function () {
    var b = '<w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (s) {
        return '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="000000"/>';
      }).join('') + '</w:tblBorders>';
    var grid = '<w:tblGrid>' + this.cols.map(function (c) {
      return '<w:gridCol w:w="' + c + '"/>';
    }).join('') + '</w:tblGrid>';

    var body = this.rows.map(function (r) {
      var cells = '';
      r.cells.forEach(function (cfg) {
        cfg = cfg || {};
        var tcPr = '<w:tcPr>' +
          (cfg.width ? '<w:tcW w:w="' + cfg.width + '" w:type="dxa"/>' : '') +
          (cfg.gridSpan > 1 ? '<w:gridSpan w:val="' + cfg.gridSpan + '"/>' : '') +
          (cfg.vMerge ? '<w:vMerge w:val="' + cfg.vMerge + '"/>' : '') +
          (cfg.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + cfg.fill + '"/>' : '') +
          '<w:vAlign w:val="center"/>' +
          '</w:tcPr>';
        var pPr = '<w:pPr>' +
          (cfg.align ? '<w:jc w:val="' + cfg.align + '"/>' : '') +
          '<w:spacing w:before="0" w:after="0"/>' +
          '</w:pPr>';
        var content;
        if (cfg.raw) content = cfg.raw;
        else {
          // Multi-line cell text becomes one paragraph per line, exactly like the
          // department's own documents. That keeps every line individually editable
          // in Word and keeps the files machine readable.
          var lines = String(cfg.text == null ? '' : cfg.text).split('\n');
          content = lines.map(function (line) {
            return '<w:p>' + pPr + runs(line, {
              font: cfg.font || this.doc.font,
              size: cfg.size || this.doc.defaultSize,
              bold: cfg.bold, italic: cfg.italic
            }) + '</w:p>';
          }, this).join('');
        }
        cells += '<w:tc>' + tcPr + content + '</w:tc>';
      }, this);
      return '<w:tr>' + cells + '</w:tr>';
    }, this).join('');

    return '<w:tbl>' +
      '<w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
      '<w:jc w:val="' + this.align + '"/>' + b + '<w:tblLayout w:type="fixed"/></w:tblPr>' +
      grid + body + '</w:tbl>';
  };

  SM.docxWrite = {
    Doc: Doc, Table: Table, esc: esc, runs: runs
  };

})(typeof window !== 'undefined' ? window : globalThis);
