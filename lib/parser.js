'use strict';

var lineData = require('./line_data');

var retailerAliases = {
  Farnell: 'Farnell',
  FEC: 'Farnell',
  Premier: 'Farnell',
  element14: 'Farnell',
  'sn-dk': 'Digikey',
  'Digi(-| )?key': 'Digikey',
  Mouser: 'Mouser',
  RS: 'RS',
  'RS(-| )?Online': 'RS',
  'RS(-| )?Delivers': 'RS',
  'Radio(-| )?Spares': 'RS',
  'RS(-| )?Components': 'RS',
  Newark: 'Newark',
  JLC: 'JLC Assembly',
  'JLC Assembly': 'JLC Assembly',
  LCSC: 'LCSC'
};

var headings = {
  'refs?': 'reference',
  'references?': 'reference',
  'line(-| )?notes?': 'reference',
  //not happy about this one but it's an eagle default in bom.ulp
  parts: 'reference',
  'designators?': 'reference',
  'comments?': 'description',
  'descriptions?': 'description',
  'cmnts?': 'description',
  'descrs?': 'description',
  'qn?tys?': 'quantity',
  quantity: 'quantity',
  quantities: 'quantity',
  'quant.?': 'quantity',
  'co?u?nt': 'quantity',
  pn: 'partNumber',
  'part(-| )?numbers?': 'partNumber',
  'm/?f parts?': 'partNumber',
  'manuf\\.? parts?': 'partNumber',
  'mpns?': 'partNumber',
  'm/?f part numbers?': 'partNumber',
  'manuf\\.? part numbers?': 'partNumber',
  'manufacturer parts?': 'partNumber',
  'manufacturer part numbers?': 'partNumber',
  'prts?': 'partNumber',
  'manuf#': 'partNumber',
  'ma?n?fr part.*': 'partNumber',
  mfpn: 'partNumber',
  'mfg.?part.*': 'partNumber',
  'retail\\.? part no\\.?': 'retailerPart',
  'retailer part number': 'retailerPart',
  'suppl\\.? part no\\.?': 'retailerPart',
  'supplier part number': 'retailerPart',
  'supplier part': 'retailerPart',
  'part no\\.?': 'retailerPart',
  'part number\\.?': 'retailerPart',
  'retailers?': 'retailer',
  'retail\\.?': 'retailer',
  'suppliers?': 'retailer',
  'suppl\\.?': 'retailer',
  fitted: 'fitted',
  fit: 'fitted',
  stuff: 'fitted',
  'do not fit': 'notFitted',
  'do not stuff': 'notFitted',
  dnf: 'notFitted',
  dns: 'notFitted',
  'values?': 'value',
  'voltages?': 'voltage',
  'volt.?': 'voltage',
  '.*power.*': 'power',
  'footprints?': 'footprint',
  'manufacturers?': 'manufacturer',
  'm/?f': 'manufacturer',
  'manuf\\.?': 'manufacturer',
  'mfg.': 'manufacturer'
};

function parse(input) {
  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

  return parseTSV(input);
}

function parseTSV(input) {
  return read(input);
}

function read(input) {
  var warnings = [];
  var aoa = input.split('\n').filter(function (l) {
    return l !== '';
  }).map(function (line) {
    return line.split('\t');
  });
  return toLines(aoa, warnings);
}

function toLines(aoa, warnings) {
  var hs = aoa[0].map(function (x) {
    return lookup(x, headings) || lookup(x, retailerAliases);
  });

  if (hs.indexOf('quantity') < 0) {
    return {
      lines: [],
      invalid: [{ row: 1, reason: 'No quantity column' }]
    };
  }
  if (hs.indexOf('reference') < 0) {
    return {
      lines: [],
      invalid: [{ row: 1, reason: 'No references column' }]
    };
  }

  var number_of_mpns = hs.filter(function (h) {
    return h === 'partNumber';
  }).length;
  var number_of_manufacturers = hs.filter(function (h) {
    return h === 'manufacturer';
  }).length;

  if (number_of_mpns !== number_of_manufacturers) {
    return {
      lines: [],
      invalid: [{
        row: 1,
        reason: 'Number of manufacturers does not match number of manufacturer part numbers.'
      }]
    };
  }

  var i = 0;
  hs = hs.map(function (x) {
    if (x === 'manufacturer') {
      return 'manufacturer_' + i;
    }
    if (x === 'partNumber') {
      var h = 'partNumber_' + i;
      i += 1;
      return h;
    }
    return x;
  });

  var lines = aoa.slice(1).map(function (a) {
    var line = {};
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = hs[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var key = _step.value;

        var index = hs.indexOf(key);
        var v = a[index];
        line[key] = v;
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    return line;
  }).map(processLine.bind(null, warnings)).filter(function (l) {
    return l.quantity > 0;
  }).filter(function (l) {
    return l.fitted;
  });
  return { lines: lines, warnings: warnings, invalid: [] };
}

function processLine(warnings, line, i) {
  var newLine = lineData.getEmptyLine();
  newLine.row = i + 1;
  var manufacturers = [];
  var parts = [];
  var retailers = [];
  var retailerParts = [];
  for (var key in line) {
    var v = stripQuotes(line[key].trim());
    if (lineData.retailer_list.indexOf(key) >= 0) {
      if (key === 'Digikey') {
        newLine.retailers[key] = v;
      } else {
        newLine.retailers[key] = v.replace(/-/g, '');
      }
    } else if (/^manufacturer_/.test(key)) {
      manufacturers.push(v);
    } else if (/^partNumber_/.test(key)) {
      parts.push(v);
    } else if (key === 'retailer') {
      retailers.push(lookup(v, retailerAliases));
    } else if (key === 'retailerPart') {
      retailerParts.push(v);
    } else if (key === 'quantity') {
      var q = parseInt(v, 10);
      if (isNaN(q) || q <= 0) {
        warnings.push({
          title: 'Invalid quantity',
          message: 'Row ' + i + ' has an invalid quantity: ' + v + '. Removing this line.'
        });
        q = 0;
      }
      newLine.quantity = q;
    } else if (key === 'notFitted') {
      newLine.fitted = /^0$/.test(v) || /false/i.test(v) || /^fitted$/i.test(v) || /^fit$/i.test(v) || /^stuff$/i.test(v) || /^stuffed$/i.test(v);
    } else if (key === 'fitted') {
      newLine.fitted = !(/^0$/i.test(v) || /false/i.test(v) || /not/i.test(v) || /dn(f|s)/i.test(v));
    } else {
      newLine[key] = v;
    }
  }
  newLine.partNumbers = parts.map(function (part, i) {
    return { part: part, manufacturer: manufacturers[i] || '' };
  });
  // handle retailer/part columns
  retailerParts.forEach(function (part, i) {
    var r = retailers[i];
    if (r !== 'Digikey') {
      part = part.replace(/-/g, '');
    }
    if (r) {
      newLine.retailers[r] = part;
    }
  });
  if (newLine.fitted == null) {
    newLine.fitted = true;
  }
  if (newLine.description == '') {
    newLine.description += newLine.value ? newLine.value + ' ' : '';
    newLine.description += newLine.voltage ? newLine.voltage + ' ' : '';
    newLine.description += newLine.power ? newLine.power + ' ' : '';
    newLine.description += newLine.footprint ? newLine.footprint + ' ' : '';
    newLine.description = newLine.description.trim();
  }
  delete newLine.value;
  delete newLine.voltage;
  delete newLine.power;
  delete newLine.footprint;
  return newLine;
}

//a case insensitive match
function lookup(name, obj) {
  for (var key in obj) {
    var re = RegExp(key, 'i');
    if (name.match(re)) {
      return obj[key];
    }
  }
  //else
  return null;
}

function stripQuotes(str) {
  var ret = str;
  if (ret[0] === '"' || ret[0] === "'") {
    ret = ret.substr(1);
  }
  var last = ret.length - 1;
  if (ret[last] === '"' || ret[last] === "'") {
    ret = ret.substr(0, last);
  }
  return ret;
}

exports.parseTSV = parseTSV;
exports.parse = parse;
exports.stripQuotes = stripQuotes;